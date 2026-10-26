import Link from 'next/link';
import { Cell, EmptyState, PageHeader, StatusBadge } from '@/components/ui/layout';
import { LinkButton } from '@/components/ui/button';
import { RowLink, Table, Td, Th, Tr } from '@/components/ui/table';
import { formatDateTime, formatEuro } from '@/lib/format';
import { receiptStatus } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Entradas de mercancía · Omnia' };

const FILTERS = [
  { value: undefined, label: 'Todos' },
  { value: 'draft', label: 'Borradores' },
  { value: 'posted', label: 'Contabilizados' },
  { value: 'cancelled', label: 'Anulados' },
];

export default async function ReceiptsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ estado?: string }> }) {
  const { org } = await params;
  const { estado } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  const receipts = await container().warehouse.receipts(ctx, estado ? { status: estado } : {});
  const base = `/o/${org}/almacen/albaranes`;

  return (
    <>
      <PageHeader
        title="Entradas de mercancía"
        description="Albaranes de proveedor. Al contabilizarlos, la mercancía entra en stock."
        actions={can('inventory.write') && <LinkButton href={`${base}/nuevo`} variant="primary">Registrar albarán</LinkButton>}
      />
      <Cell>
        <nav aria-label="Estado" className="mb-3 flex flex-wrap gap-2 text-sm">
          {FILTERS.map((f) => (
            <Link key={f.label} href={f.value ? `${base}?estado=${f.value}` : base} aria-current={estado === f.value ? 'true' : undefined} className="rounded-full border border-line px-3 py-1 aria-[current]:border-ink aria-[current]:bg-ink aria-[current]:text-white">
              {f.label}
            </Link>
          ))}
        </nav>
        {receipts.length === 0 ? (
          <EmptyState title="No hay albaranes con este filtro">Registra un albarán al recibir mercancía o recíbelo desde un pedido de compra.</EmptyState>
        ) : (
          <Table minWidth={820}>
            <thead>
              <tr>
                <Th>Nº</Th>
                <Th>Proveedor</Th>
                <Th>Albarán proveedor</Th>
                <Th>Almacén</Th>
                <Th>Recibido</Th>
                <Th align="right">Coste</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <RowLink href={`${base}/${r.id}`}>{String(r.number).padStart(5, '0')}</RowLink>
                  </Td>
                  <Td>{r.supplierName}</Td>
                  <Td className="text-ink-2">
                    {r.supplierDeliveryNote}
                    {r.purchaseOrderNumber && <span className="block text-xs text-ink-3">Pedido {r.purchaseOrderNumber}</span>}
                  </Td>
                  <Td className="text-ink-2">{r.warehouseName}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{formatDateTime(r.receivedAt)}</Td>
                  <Td align="right">{formatEuro(r.totalCost)}</Td>
                  <Td><StatusBadge map={receiptStatus} value={r.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Cell>
    </>
  );
}
