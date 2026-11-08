import Link from 'next/link';
import { Cell, EmptyState, StatusBadge } from '@/components/ui/layout';
import { inputClass } from '@/components/ui/form';
import { RowLink, Table, Td, Th, Tr } from '@/components/ui/table';
import { formatDate, formatEuro } from '@/lib/format';
import { fiscalStatus, invoiceStatus, receivedInvoiceStatus } from '@/lib/labels';
import type { InvoicePage, InvoiceSummary } from '@omnia/invoicing/types';

const FILTERS = [
  { value: undefined, label: 'Todas' },
  { value: 'unpaid', label: 'Pendientes' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'draft', label: 'Borradores' },
];

const TYPES = [
  { value: undefined, label: 'Todos los tipos' },
  { value: 'facturas', label: 'Facturas' },
  { value: 'rectificativas', label: 'Rectificativas' },
  { value: 'tickets', label: 'Tickets TPV' },
];

const chipClass = 'pressable rounded-full bg-fill px-3.5 py-1.5 font-medium text-ink-2 hover:bg-fill-strong hover:text-ink aria-[current]:bg-tint aria-[current]:text-on-tint';

export function InvoiceList({ page, cursor, base, direction, estado, tipo, q }: { page: InvoicePage<InvoiceSummary>; cursor?: string | undefined; base: string; direction: 'issued' | 'received'; estado?: string | undefined; tipo?: string | undefined; q?: string | undefined }) {
  const invoices = page.items;
  // Cambiar de filtro vuelve siempre a la primera página: el cursor solo vale para el filtro que lo generó.
  const href = (next: { estado?: string | undefined; tipo?: string | undefined; cursor?: string | undefined }) => {
    const e = 'estado' in next ? next.estado : estado;
    const t = 'tipo' in next ? next.tipo : tipo;
    const p = new URLSearchParams({ ...(e ? { estado: e } : {}), ...(t ? { tipo: t } : {}), ...(q ? { q } : {}), ...(next.cursor ? { cursor: next.cursor } : {}) }).toString();
    return p ? `${base}?${p}` : base;
  };
  return (
    <Cell>
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start">
        <div className="flex flex-col gap-2">
          <nav aria-label="Estado" className="flex flex-wrap gap-2 text-sm">
            {FILTERS.filter((f) => direction === 'issued' || f.value !== 'draft').map((f) => (
              <Link key={f.label} href={href({ estado: f.value })} aria-current={estado === f.value ? 'true' : undefined} className={chipClass}>
                {f.label}
              </Link>
            ))}
          </nav>
          {direction === 'issued' && (
            <nav aria-label="Tipo" className="flex flex-wrap gap-2 text-sm">
              {TYPES.map((t) => (
                <Link key={t.label} href={href({ tipo: t.value })} aria-current={tipo === t.value ? 'true' : undefined} className={chipClass}>
                  {t.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <form role="search" className="md:ml-auto md:w-72">
          {estado && <input type="hidden" name="estado" value={estado} />}
          {tipo && <input type="hidden" name="tipo" value={tipo} />}
          <label htmlFor="q" className="sr-only">Buscar factura</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Número o tercero" className={inputClass} />
        </form>
      </div>
      {invoices.length === 0 ? (
        <EmptyState title={cursor ? 'No hay facturas más antiguas' : 'No hay facturas con este filtro'} />
      ) : (
        <>
          <Table minWidth={860}>
            <thead>
              <tr>
                <Th>Factura</Th>
                <Th>{direction === 'issued' ? 'Cliente' : 'Proveedor'}</Th>
                <Th>Fecha</Th>
                <Th>Vence</Th>
                <Th align="right">Total</Th>
                <Th align="right">Pendiente</Th>
                <Th>Estado</Th>
                {direction === 'issued' && <Th>VeriFactu</Th>}
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <Tr key={i.id}>
                  <Td>
                    <RowLink href={`${base}/${i.id}`}>{i.fullNumber ?? 'Borrador'}</RowLink>
                    {i.invoiceType !== 'F1' && <span className="block text-xs text-ink-3">{i.invoiceType === 'F2' ? 'Ticket' : i.invoiceType === 'F3' ? 'Sustitutiva de simplificadas' : 'Rectificativa'}</span>}
                  </Td>
                  <Td className="max-w-56 truncate">{i.partyName ?? 'Cliente de mostrador'}</Td>
                  <Td className="text-ink-2">{formatDate(i.issueDate)}</Td>
                  <Td className={i.overdueDays ? 'font-semibold text-danger' : 'text-ink-2'}>
                    {formatDate(i.dueDate)}
                    {i.overdueDays ? <span className="block text-xs">hace {i.overdueDays} días</span> : null}
                  </Td>
                  <Td align="right">{formatEuro(i.total)}</Td>
                  <Td align="right" className={Number(i.total) - Number(i.paidTotal) > 0 && i.status !== 'draft' ? 'font-semibold' : 'text-ink-3'}>
                    {i.status === 'draft' || i.status === 'cancelled' ? '—' : formatEuro(Number(i.total) - Number(i.paidTotal))}
                  </Td>
                  <Td><StatusBadge map={direction === 'issued' ? invoiceStatus : receivedInvoiceStatus} value={i.status} /></Td>
                  {direction === 'issued' && <Td>{i.status !== 'draft' && <StatusBadge map={fiscalStatus} value={i.fiscalStatus} />}</Td>}
                </Tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <nav aria-label="Paginación" className="flex gap-2">
              {cursor && (
                <Link href={href({})} className={chipClass}>
                  ← Más recientes
                </Link>
              )}
              {page.nextCursor && (
                <Link href={href({ cursor: page.nextCursor })} className={chipClass}>
                  Más antiguas →
                </Link>
              )}
            </nav>
            <p className="ml-auto text-ink-2">
              Pendiente con este filtro: <b className="text-ink">{formatEuro(page.outstandingTotal)}</b>
            </p>
          </div>
        </>
      )}
    </Cell>
  );
}
