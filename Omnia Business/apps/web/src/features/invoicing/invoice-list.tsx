import Link from 'next/link';
import { Cell, EmptyState, StatusBadge } from '@/components/ui/layout';
import { inputClass } from '@/components/ui/form';
import { RowLink, Table, Td, Th, Tr } from '@/components/ui/table';
import { formatDate, formatEuro } from '@/lib/format';
import { fiscalStatus, invoiceStatus, receivedInvoiceStatus } from '@/lib/labels';
import type { InvoiceSummary } from '@omnia/invoicing/types';

const FILTERS = [
  { value: undefined, label: 'Todas' },
  { value: 'unpaid', label: 'Pendientes' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'draft', label: 'Borradores' },
];

export function InvoiceList({ invoices, base, direction, estado, q }: { invoices: InvoiceSummary[]; base: string; direction: 'issued' | 'received'; estado?: string | undefined; q?: string | undefined }) {
  const href = (value?: string) => {
    const p = new URLSearchParams({ ...(value ? { estado: value } : {}), ...(q ? { q } : {}) }).toString();
    return p ? `${base}?${p}` : base;
  };
  const total = invoices.reduce((s, i) => s + Number(i.total) - Number(i.paidTotal), 0);
  return (
    <Cell>
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center">
        <nav aria-label="Estado" className="flex flex-wrap gap-2 text-sm">
          {FILTERS.filter((f) => direction === 'issued' || f.value !== 'draft').map((f) => (
            <Link key={f.label} href={href(f.value)} aria-current={estado === f.value ? 'true' : undefined} className="rounded-full border border-line px-3 py-1 aria-[current]:border-ink aria-[current]:bg-ink aria-[current]:text-white">
              {f.label}
            </Link>
          ))}
        </nav>
        <form role="search" className="md:ml-auto md:w-72">
          {estado && <input type="hidden" name="estado" value={estado} />}
          <label htmlFor="q" className="sr-only">Buscar factura</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Número o tercero" className={inputClass} />
        </form>
      </div>
      {invoices.length === 0 ? (
        <EmptyState title="No hay facturas con este filtro" />
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
                    {i.invoiceType !== 'F1' && <span className="block text-xs text-ink-3">{i.invoiceType === 'F2' ? 'Ticket' : 'Rectificativa'}</span>}
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
          <p className="mt-3 text-right text-sm text-ink-2">
            Pendiente en esta lista: <b className="text-ink">{formatEuro(total)}</b>
          </p>
        </>
      )}
    </Cell>
  );
}
