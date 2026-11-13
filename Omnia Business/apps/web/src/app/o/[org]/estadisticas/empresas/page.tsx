import Link from 'next/link';
import { Cell, EmptyState, PageHeader } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { LimitBar } from '@/features/home/panels';
import { parsePeriod, periodRange, PERIODS } from '@/features/stats/period';
import { ManagementNote, Pills } from '@/features/stats/ui';
import { formatEuro } from '@/lib/format';
import { container } from '@/server/container';
import { activeEstablishment, requireOrg } from '@/server/session';

export const metadata = { title: 'Por empresa · Estadísticas · Omnia' };

/** Último día del mes de una fecha YYYY-MM-01. */
const endOfMonth = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};
const hours = (h: number) => `${h.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`;

/** Comparativa de las empresas (negocios o locales) de la sociedad. */
export default async function EstablishmentsStatsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ periodo?: string }> }) {
  const { org } = await params;
  const periodo = parsePeriod((await searchParams).periodo);
  const { ctx, can, org: membership } = await requireOrg(org);
  if (!can('stats.read')) return null;

  const header = (
    <PageHeader
      title="Por empresa"
      description="Ventas, tickets, stock y horas de cada negocio o local de la sociedad."
      actions={<Pills items={PERIODS} current={periodo} href={(v) => `/o/${org}/estadisticas/empresas?periodo=${v}`} />}
    />
  );
  if (membership.kind === 'holding') {
    return (
      <>
        {header}
        <Cell><EmptyState title="Un holding no tiene empresas propias">Las empresas van dentro de cada sociedad: ábrela para ver esta comparativa.</EmptyState></Cell>
      </>
    );
  }

  const range = periodRange(periodo);
  const [rows, active] = await Promise.all([container().stats.establishments(ctx, range.from, endOfMonth(range.to)), activeEstablishment(org)]);
  const total = rows.reduce((t, r) => t + r.salesBase, 0);

  return (
    <>
      {header}
      <Cell>
        {rows.length === 0 ? (
          <EmptyState title="Aún no hay empresas en esta sociedad">
            Créalas en <Link href={`/o/${org}/ajustes/empresas`} className="text-tint hover:underline">Ajustes › Empresas</Link> y asígnales sus almacenes: las ventas se atribuyen por el almacén del que salen.
          </EmptyState>
        ) : (
          <Table minWidth={980}>
            <thead>
              <tr>
                <Th>Empresa</Th>
                <Th align="right">Facturación</Th>
                <Th className="w-40">Peso</Th>
                <Th align="right">TPV</Th>
                <Th align="right">Tickets</Th>
                <Th align="right">Ticket medio</Th>
                <Th align="right">Pedidos B2B</Th>
                <Th align="right">Stock a coste</Th>
                <Th align="right">Personas</Th>
                <Th align="right">Horas de turno</Th>
                <Th align="right">Venta por hora</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const share = total > 0 ? Math.round((100 * r.salesBase) / total) : 0;
                const current = active?.id === r.establishmentId;
                return (
                  <Tr key={r.establishmentId ?? 'none'}>
                    <Td className="font-medium">
                      <span className={r.establishmentId ? '' : 'text-ink-3'}>{r.name ?? 'Sin empresa'}</span>
                      {!r.isActive && <span className="ml-1.5 text-[12px] text-ink-3">(inactiva)</span>}
                      {current && <span className="ml-1.5 text-[12px] font-semibold text-tint">· elegida</span>}
                    </Td>
                    <Td align="right" className="font-semibold tabular-nums">{formatEuro(r.salesBase)}</Td>
                    <Td><LimitBar value={share} tone="neutral" label={`${share} % de la facturación`} /></Td>
                    <Td align="right" className="tabular-nums">{formatEuro(r.posBase)}</Td>
                    <Td align="right" className="tabular-nums">{r.tickets}</Td>
                    <Td align="right" className="tabular-nums">{r.tickets ? formatEuro(r.posBase / r.tickets) : '—'}</Td>
                    <Td align="right" className="tabular-nums">{formatEuro(r.b2bBase)}</Td>
                    <Td align="right" className="tabular-nums">{formatEuro(r.stockValue)}</Td>
                    <Td align="right" className="tabular-nums">{r.staff}</Td>
                    <Td align="right" className="tabular-nums">{hours(r.shiftHours)}</Td>
                    <Td align="right" className="tabular-nums">{r.shiftHours > 0 ? formatEuro(r.salesBase / r.shiftHours) : '—'}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Cell>
      <ManagementNote>
        Facturación sin IVA de lo emitido en el periodo. Cada venta cuenta para la empresa del almacén del que sale: los tickets, por el terminal del TPV; los pedidos B2B, por su almacén.
        «Sin empresa» recoge las facturas hechas a mano y los almacenes sin asignar. Las horas son las de los turnos programados.
      </ManagementNote>
    </>
  );
}
