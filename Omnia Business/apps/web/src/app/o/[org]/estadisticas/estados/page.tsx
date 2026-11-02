import Link from 'next/link';
import { Cell, PageHeader, Ruled } from '@/components/ui/layout';
import { BarChart, CHART_INK, CHART_LOSS } from '@/features/stats/bar-chart';
import { parseYear } from '@/features/stats/period';
import { ManagementNote, Pills, StatementRow, yearOptions } from '@/features/stats/ui';
import { formatDate, formatMonth, todayIso } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { monthCashFlow, results } from '@omnia/stats';

export const metadata = { title: 'Estados financieros · Estadísticas · Omnia' };

const round2 = (n: number) => Math.round(n * 100) / 100;

export default async function StatementsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ anio?: string }> }) {
  const { org } = await params;
  const year = parseYear((await searchParams).anio);
  const { ctx, can } = await requireOrg(org);
  // El layout ya enseña «sin acceso»; la página se renderiza a la vez y no debe consultar.
  if (!can('stats.read')) return null;
  const [snap, months] = await Promise.all([container().stats.snapshot(ctx), container().stats.monthly(ctx, `${year}-01-01`, `${year}-12-01`)]);
  const r = results(months);
  const today = todayIso();
  const current = Number(today.slice(0, 4));

  // Balance de lo que consta en Omnia: sin inmovilizado, bancos ni fondos propios.
  const vat = round2(snap.vatOutput - snap.vatInput);
  const assets = round2(snap.inventory + snap.receivable + snap.cashInRegisters + (vat < 0 ? -vat : 0));
  const liabilities = round2(snap.payable + (vat > 0 ? vat : 0));

  const collected = round2(months.reduce((t, m) => t + m.collected, 0));
  const paidOut = round2(months.reduce((t, m) => t + m.paidOut, 0));
  const payroll = round2(months.reduce((t, m) => t + m.payrollNet, 0));
  const shown = year === current ? months.filter((m) => m.month <= today) : months;

  return (
    <>
      <PageHeader title="Estados financieros" description="Balance de situación, cuenta de resultados y flujos de efectivo con los datos registrados en Omnia." />
      <Ruled cols="xl:grid-cols-2">
        <Cell title={`Balance de situación · a ${formatDate(today)}`}>
          <table className="w-full text-sm">
            <tbody>
              <tr><th colSpan={2} scope="colgroup" className="pb-1 text-left text-xs font-semibold text-ink-3">Activo corriente</th></tr>
              <StatementRow label="Existencias" values={[snap.inventory]} hint="Stock valorado a coste medio" />
              <StatementRow label="Clientes" values={[snap.receivable]} hint={snap.receivableOverdue > 0 ? `De ello, vencido: ${snap.receivableOverdue.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}` : 'Facturas pendientes de cobro'} />
              <StatementRow label="Efectivo en cajas del TPV" values={[snap.cashInRegisters]} hint="Cajas abiertas ahora mismo" />
              {vat < 0 && <StatementRow label="Hacienda, IVA a compensar" values={[-vat]} hint="Trimestre en curso" />}
              <StatementRow label="Total activo corriente" values={[assets]} level="total" />
              <tr><th colSpan={2} scope="colgroup" className="pt-4 pb-1 text-left text-xs font-semibold text-ink-3">Pasivo corriente</th></tr>
              <StatementRow label="Proveedores" values={[snap.payable]} hint={snap.payableOverdue > 0 ? `De ello, vencido: ${snap.payableOverdue.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}` : 'Facturas pendientes de pago'} />
              {vat > 0 && <StatementRow label="Hacienda, IVA a pagar" values={[vat]} hint={`Trimestre en curso, desde el ${formatDate(snap.quarterStart)}`} />}
              <StatementRow label="Total pasivo corriente" values={[liabilities]} level="total" />
              <StatementRow label="Fondo de maniobra" values={[round2(assets - liabilities)]} level="result" hint="Activo corriente menos pasivo corriente" />
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink-3">No incluye saldos bancarios, inmovilizado, préstamos ni fondos propios: Omnia no los registra.</p>
        </Cell>

        <Cell title={`Cuenta de resultados · ${year}`} actions={<Link href={`/o/${org}/estadisticas/resultados?anio=${year}`} className="text-sm font-medium underline-offset-2 hover:underline">Ver completa</Link>}>
          <table className="w-full text-sm">
            <tbody>
              <StatementRow label="Cifra de negocios" values={[r.revenue]} />
              <StatementRow label="Aprovisionamientos" values={[-r.supplies]} />
              <StatementRow label="Margen bruto" values={[r.grossMargin]} level="total" />
              <StatementRow label="Gastos de personal" values={[-r.payroll]} />
              <StatementRow label="Otros gastos de explotación" values={[-r.otherExpenses]} />
              <StatementRow label="Resultado de explotación" values={[r.operatingResult]} level="result" />
            </tbody>
          </table>
        </Cell>
      </Ruled>

      <Cell className="border-b border-line" title={`Estado de flujos de efectivo · ${year}`} actions={<Pills items={yearOptions(current)} current={String(year)} href={(y) => `/o/${org}/estadisticas/estados?anio=${y}`} />}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <table className="w-full text-sm">
              <tbody>
                <StatementRow label="Cobros de clientes" values={[collected]} />
                <StatementRow label="Pagos a proveedores" values={[-paidOut]} />
                <StatementRow label="Pagos de nóminas" values={[-payroll]} hint="Líquido de las nóminas subidas" />
                <StatementRow label="Flujo neto de explotación" values={[round2(collected - paidOut - payroll)]} level="result" />
              </tbody>
            </table>
          </div>
          <div>
            <BarChart
              title={`Flujo neto de efectivo por mes en ${year}`}
              labels={shown.map((m) => formatMonth(m.month).slice(0, 3))}
              series={[{ name: 'Flujo neto', color: CHART_INK, values: shown.map(monthCashFlow) }]}
              lossColor={CHART_LOSS}
              height={200}
            />
          </div>
        </div>
      </Cell>
      <div className="px-4 py-3 md:px-5">
        <ManagementNote />
      </div>
    </>
  );
}
