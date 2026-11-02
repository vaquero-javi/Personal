import { Cell, PageHeader, Ruled } from '@/components/ui/layout';
import { BarChart, CHART_GRAY, CHART_INK, CHART_LOSS } from '@/features/stats/bar-chart';
import { change, parsePeriod, periodRange, PERIODS } from '@/features/stats/period';
import { Kpi, ManagementNote, Pills } from '@/features/stats/ui';
import { formatEuro, formatMonth } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { monthCashFlow, monthExpenses, results } from '@omnia/stats';

export const metadata = { title: 'Cuadro de mando · Estadísticas · Omnia' };

export default async function DashboardPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ periodo?: string }> }) {
  const { org } = await params;
  const periodo = parsePeriod((await searchParams).periodo);
  const { ctx, can } = await requireOrg(org);
  // El layout ya enseña «sin acceso»; la página se renderiza a la vez y no debe consultar.
  if (!can('stats.read')) return null;
  const range = periodRange(periodo);
  const last12 = periodRange('12m');
  const stats = container().stats;
  const [now, before, trend, snap] = await Promise.all([
    stats.monthly(ctx, range.from, range.to),
    stats.monthly(ctx, range.prevFrom, range.prevTo),
    stats.monthly(ctx, last12.from, last12.to),
    stats.snapshot(ctx),
  ]);
  const r = results(now);
  const p = results(before);
  const expenses = r.supplies + r.payroll + r.otherExpenses;
  const prevExpenses = p.supplies + p.payroll + p.otherExpenses;
  const cash = now.reduce((t, m) => t + monthCashFlow(m), 0);
  const labels = trend.map((m) => formatMonth(m.month).slice(0, 3) + ' ' + m.month.slice(2, 4));

  return (
    <>
      <PageHeader
        title="Cuadro de mando"
        description="Facturación, gastos y neto del periodo, comparados con el periodo anterior."
        actions={<Pills items={PERIODS} current={periodo} href={(v) => `/o/${org}/estadisticas?periodo=${v}`} />}
      />
      <Ruled cols="md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Facturación" value={formatEuro(r.revenue)} delta={change(r.revenue, p.revenue)} note="Sin IVA" />
        <Kpi label="Gastos" value={formatEuro(expenses)} delta={change(expenses, prevExpenses)} invert note="Compras, servicios y nóminas" />
        <Kpi label="Neto (resultado)" value={formatEuro(r.operatingResult)} delta={change(r.operatingResult, p.operatingResult)} />
        <Kpi label="Margen" value={r.marginPct === null ? '—' : `${r.marginPct.toLocaleString('es-ES')} %`} note="Resultado sobre facturación" />
        <Kpi label="Pendiente de cobro" value={formatEuro(snap.receivable)} note={snap.receivableOverdue > 0 ? `${formatEuro(snap.receivableOverdue)} vencido` : 'Nada vencido'} />
        <Kpi label="Liquidez del periodo" value={formatEuro(cash)} note="Cobros − pagos − nóminas" />
      </Ruled>
      <Ruled cols="xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Cell title="Facturación y gastos · últimos 12 meses">
          <BarChart
            title="Facturación y gastos por mes, últimos 12 meses"
            labels={labels}
            series={[
              { name: 'Facturación', color: CHART_INK, values: trend.map((m) => m.salesBase) },
              { name: 'Gastos', color: CHART_GRAY, values: trend.map(monthExpenses) },
            ]}
          />
        </Cell>
        <Cell title="Neto por mes · últimos 12 meses">
          <BarChart
            title="Resultado por mes, últimos 12 meses"
            labels={labels}
            series={[{ name: 'Neto', color: CHART_INK, values: trend.map((m) => Math.round((m.salesBase - monthExpenses(m)) * 100) / 100) }]}
            lossColor={CHART_LOSS}
          />
        </Cell>
      </Ruled>
      <Ruled cols="md:grid-cols-2">
        <Cell title="Mejores clientes del año">
          {snap.topCustomers.length === 0 ? (
            <p className="text-sm text-ink-3">Aún no hay facturas a clientes este año.</p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {snap.topCustomers.map((c) => {
                const share = snap.topCustomers[0]!.base > 0 ? (c.base / snap.topCustomers[0]!.base) * 100 : 0;
                return (
                  <li key={c.name} className="flex flex-col gap-1">
                    <span className="flex justify-between gap-3">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="font-semibold tabular-nums">{formatEuro(c.base)}</span>
                    </span>
                    <span aria-hidden className="h-1.5 rounded-full bg-line-soft">
                      <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.max(2, share)}%` }} />
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </Cell>
        <Cell title="Hoy">
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-3">Nos deben clientes</dt><dd className="text-right font-semibold tabular-nums">{formatEuro(snap.receivable)}</dd>
            <dt className="text-ink-3">Debemos a proveedores</dt><dd className="text-right font-semibold tabular-nums">{formatEuro(snap.payable)}</dd>
            <dt className="text-ink-3">Existencias (a coste)</dt><dd className="text-right font-semibold tabular-nums">{formatEuro(snap.inventory)}</dd>
            <dt className="text-ink-3">Efectivo en cajas del TPV</dt><dd className="text-right font-semibold tabular-nums">{formatEuro(snap.cashInRegisters)}</dd>
            <dt className="text-ink-3">IVA del trimestre (a pagar)</dt><dd className="text-right font-semibold tabular-nums">{formatEuro(snap.vatOutput - snap.vatInput)}</dd>
          </dl>
          {r.pos > 0 && <p className="mt-3 text-xs text-ink-3">De la facturación del periodo, {formatEuro(r.pos)} son tickets del TPV.</p>}
        </Cell>
      </Ruled>
      <div className="px-4 py-3 md:px-5">
        <ManagementNote />
      </div>
    </>
  );
}
