import { Cell, PageHeader } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { parseYear } from '@/features/stats/period';
import { buildReport, REPORT_COLUMNS } from '@/features/stats/report';
import { ManagementNote, Pills, yearOptions } from '@/features/stats/ui';
import { formatEuro, todayIso } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Informes de gestión · Estadísticas · Omnia' };

const GROUPS = [
  { value: 'mes', label: 'Mensual' },
  { value: 'trimestre', label: 'Trimestral' },
] as const;

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ anio?: string; agrupar?: string }> }) {
  const { org } = await params;
  const sp = await searchParams;
  const year = parseYear(sp.anio);
  const groupBy = sp.agrupar === 'trimestre' ? 'trimestre' : 'mes';
  const { ctx, can } = await requireOrg(org);
  // El layout ya enseña «sin acceso»; la página se renderiza a la vez y no debe consultar.
  if (!can('stats.read')) return null;
  const today = todayIso();
  const current = Number(today.slice(0, 4));
  const months = (await container().stats.monthly(ctx, `${year}-01-01`, `${year}-12-01`)).filter((m) => year < current || m.month <= today);
  const { rows, total } = buildReport(months, groupBy);
  const href = (y: string, g: string) => `/o/${org}/estadisticas/informes?anio=${y}&agrupar=${g}`;

  return (
    <>
      <PageHeader
        title="Informes de gestión"
        description="Cuánto se ha facturado y cobrado, cuánto se ha gastado y pagado, y qué liquidez queda, por mes o por trimestre."
        actions={
          <a href={`/o/${org}/estadisticas/informes/csv?anio=${year}&agrupar=${groupBy}`} className="inline-flex h-[34px] items-center rounded-md border border-shelf-edge bg-sheet px-4 text-sm font-semibold hover:bg-sheet-head">
            Descargar CSV
          </a>
        }
      />
      <Cell>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Pills items={GROUPS} current={groupBy} href={(g) => href(String(year), g)} />
          <Pills items={yearOptions(current)} current={String(year)} href={(y) => href(y, groupBy)} />
        </div>
        <Table minWidth={980}>
          <thead>
            <tr>
              <Th>{groupBy === 'mes' ? 'Mes' : 'Trimestre'}</Th>
              {REPORT_COLUMNS.map((c) => <Th key={c.key} align="right">{c.label}</Th>)}
            </tr>
          </thead>
          <tbody>
            {[...rows, total].map((row) => (
              <Tr key={row.label} highlight={false}>
                <Td className={row === total ? 'font-bold' : 'font-medium'}>{row.label}</Td>
                {REPORT_COLUMNS.map((c) => {
                  const v = row[c.key];
                  return (
                    <Td key={c.key} align="right" className={`${row === total ? 'border-t-2 border-t-ink font-bold' : ''} ${(c.key === 'net' || c.key === 'liquidity') && v < 0 ? 'text-danger' : ''}`}>
                      {c.money ? formatEuro(v) : v.toLocaleString('es-ES')}
                    </Td>
                  );
                })}
              </Tr>
            ))}
          </tbody>
        </Table>
        <dl className="mt-4 grid gap-x-6 gap-y-1 text-xs text-ink-3 md:grid-cols-2">
          <div><dt className="inline font-semibold">Neto:</dt> <dd className="inline">facturado (sin IVA) menos gastos (compras, servicios y nóminas).</dd></div>
          <div><dt className="inline font-semibold">Liquidez neta:</dt> <dd className="inline">lo cobrado menos lo pagado a proveedores y en nóminas en ese periodo.</dd></div>
        </dl>
      </Cell>
      <div className="border-t border-line px-4 py-3 md:px-5">
        <ManagementNote />
      </div>
    </>
  );
}
