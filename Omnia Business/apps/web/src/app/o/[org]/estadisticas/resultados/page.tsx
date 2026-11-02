import { Cell, PageHeader } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { change, parseYear } from '@/features/stats/period';
import { ManagementNote, Pills, StatementRow, yearOptions } from '@/features/stats/ui';
import { formatEuro, formatMonth, todayIso } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { monthExpenses, results } from '@omnia/stats';

export const metadata = { title: 'Cuenta de resultados · Estadísticas · Omnia' };

const SPANS = [
  { value: 'anio', label: 'Año completo' },
  { value: 't1', label: '1.er trimestre' },
  { value: 't2', label: '2.º trimestre' },
  { value: 't3', label: '3.er trimestre' },
  { value: 't4', label: '4.º trimestre' },
] as const;

const bounds = (year: number, span: string) => {
  const q = Number(span.slice(1));
  const [m0, m1] = span === 'anio' ? [1, 12] : [q * 3 - 2, q * 3];
  const pad = (n: number) => String(n).padStart(2, '0');
  return [`${year}-${pad(m0)}-01`, `${year}-${pad(m1)}-01`] as const;
};

export default async function ResultsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ anio?: string; tramo?: string }> }) {
  const { org } = await params;
  const sp = await searchParams;
  const year = parseYear(sp.anio);
  const span = SPANS.some((s) => s.value === sp.tramo) ? sp.tramo! : 'anio';
  const { ctx, can } = await requireOrg(org);
  // El layout ya enseña «sin acceso»; la página se renderiza a la vez y no debe consultar.
  if (!can('stats.read')) return null;
  const [from, to] = bounds(year, span);
  const [pFrom, pTo] = bounds(year - 1, span);
  const [now, before] = await Promise.all([container().stats.monthly(ctx, from, to), container().stats.monthly(ctx, pFrom, pTo)]);
  const r = results(now);
  const p = results(before);
  const current = Number(todayIso().slice(0, 4));
  const href = (y: number, t: string) => `/o/${org}/estadisticas/resultados?anio=${y}&tramo=${t}`;
  const spanLabel = SPANS.find((s) => s.value === span)!.label.toLowerCase();
  const pct = (a: number, b: number) => {
    const c = change(a, b);
    return c === null ? '—' : `${c > 0 ? '+' : ''}${c.toLocaleString('es-ES')} %`;
  };
  const rows: { label: string; now: number; before: number; level?: 'line' | 'sub' | 'total' | 'result'; hint?: string }[] = [
    { label: 'Importe neto de la cifra de negocios', now: r.revenue, before: p.revenue, hint: 'Facturas emitidas y tickets, sin IVA y descontadas las rectificativas' },
    { label: 'de ella, ventas del TPV', now: r.pos, before: p.pos, level: 'sub' },
    { label: 'Aprovisionamientos', now: -r.supplies, before: -p.supplies, hint: 'Facturas recibidas de artículos de almacén' },
    { label: 'Margen bruto', now: r.grossMargin, before: p.grossMargin, level: 'total' },
    { label: 'Gastos de personal', now: -r.payroll, before: -p.payroll, hint: 'Líquido de las nóminas subidas (sin Seguridad Social a cargo de la empresa)' },
    { label: 'Otros gastos de explotación', now: -r.otherExpenses, before: -p.otherExpenses, hint: 'Resto de facturas recibidas: servicios, suministros, alquiler…' },
    { label: 'Resultado de explotación', now: r.operatingResult, before: p.operatingResult, level: 'result' },
  ];

  return (
    <>
      <PageHeader title="Cuenta de resultados" description={`Ingresos, gastos y resultado del ${spanLabel} de ${year}, frente al mismo periodo de ${year - 1}.`} />
      <Cell>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Pills items={SPANS} current={span} href={(t) => href(year, t)} />
          <Pills items={yearOptions(current)} current={String(year)} href={(y) => href(Number(y), span)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-xs text-ink-3">
                <th scope="col" className="pb-2 text-left font-semibold">Concepto</th>
                <th scope="col" className="pb-2 pl-4 text-right font-semibold">{year}</th>
                <th scope="col" className="pb-2 pl-4 text-right font-semibold">{year - 1}</th>
                <th scope="col" className="pb-2 pl-4 text-right font-semibold">Variación</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <StatementRow key={row.label} label={row.label} values={[row.now, row.before]} level={row.level} {...(row.hint ? { hint: row.hint } : {})} extra={pct(row.now, row.before)} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-ink-2">
          Margen sobre ventas: <b>{r.marginPct === null ? '—' : `${r.marginPct.toLocaleString('es-ES')} %`}</b>
          {p.marginPct !== null && <span className="text-ink-3"> (en {year - 1}: {p.marginPct.toLocaleString('es-ES')} %)</span>}
        </p>
      </Cell>
      <Cell title="Mes a mes" className="border-t border-line">
        <Table minWidth={720}>
          <thead>
            <tr>
              <Th>Mes</Th>
              <Th align="right">Ventas</Th>
              <Th align="right">Aprovisionamientos</Th>
              <Th align="right">Personal</Th>
              <Th align="right">Otros gastos</Th>
              <Th align="right">Resultado</Th>
            </tr>
          </thead>
          <tbody>
            {now.map((m) => {
              const result = Math.round((m.salesBase - monthExpenses(m)) * 100) / 100;
              return (
                <Tr key={m.month}>
                  <Td>{formatMonth(m.month)}</Td>
                  <Td align="right">{formatEuro(m.salesBase)}</Td>
                  <Td align="right">{formatEuro(m.suppliesBase)}</Td>
                  <Td align="right">{formatEuro(m.payrollNet)}</Td>
                  <Td align="right">{formatEuro(m.expensesBase)}</Td>
                  <Td align="right" className={`font-semibold ${result < 0 ? 'text-danger' : ''}`}>{formatEuro(result)}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Cell>
      <div className="px-4 py-3 md:px-5">
        <ManagementNote>Sin amortizaciones, gastos financieros ni impuesto de sociedades: el resultado es de explotación.</ManagementNote>
      </div>
    </>
  );
}

