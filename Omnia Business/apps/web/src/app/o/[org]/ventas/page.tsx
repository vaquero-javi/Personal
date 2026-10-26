import Link from 'next/link';
import { Cell, EmptyState, PageHeader, StatusBadge } from '@/components/ui/layout';
import { LinkButton } from '@/components/ui/button';
import { RowLink, Table, Td, Th, Tr } from '@/components/ui/table';
import { formatDate, formatEuro } from '@/lib/format';
import { salesOrderStatus } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Pedidos de venta · Omnia' };

export default async function SalesOrdersPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ estado?: string }> }) {
  const { org } = await params;
  const { estado } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  const orders = await container().sales.list(ctx, estado ? { status: estado } : {});
  const base = `/o/${org}/ventas`;
  const filters = [undefined, 'draft', 'confirmed', 'delivered', 'invoiced'] as const;
  return (
    <>
      <PageHeader
        title="Pedidos de cliente (B2B)"
        description="Confirma, sirve (sale del almacén) y factura: cada paso en una transacción."
        actions={can('sales.write') && <LinkButton href={`${base}/pedidos/nuevo`} variant="primary">Nuevo pedido</LinkButton>}
      />
      <Cell>
        <nav aria-label="Estado" className="mb-3 flex flex-wrap gap-2 text-sm">
          {filters.map((f) => (
            <Link key={f ?? 'all'} href={f ? `${base}?estado=${f}` : base} aria-current={estado === f ? 'true' : undefined} className="rounded-full border border-line px-3 py-1 aria-[current]:border-ink aria-[current]:bg-ink aria-[current]:text-white">
              {f ? salesOrderStatus[f]![0] : 'Todos'}
            </Link>
          ))}
        </nav>
        {orders.length === 0 ? (
          <EmptyState title="No hay pedidos con este filtro" />
        ) : (
          <Table minWidth={760}>
            <thead>
              <tr>
                <Th>Nº</Th>
                <Th>Cliente</Th>
                <Th>Fecha</Th>
                <Th align="right">Total</Th>
                <Th>Factura</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <Tr key={o.id}>
                  <Td><RowLink href={`${base}/pedidos/${o.id}`}>PV-{String(o.number).padStart(4, '0')}</RowLink></Td>
                  <Td>{o.customerName}</Td>
                  <Td className="text-ink-2">{formatDate(o.orderDate)}</Td>
                  <Td align="right">{formatEuro(o.total)}</Td>
                  <Td className="text-ink-2">{o.invoiceNumber ?? '—'}</Td>
                  <Td><StatusBadge map={salesOrderStatus} value={o.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Cell>
    </>
  );
}
