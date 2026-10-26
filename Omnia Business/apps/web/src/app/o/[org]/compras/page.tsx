import Link from 'next/link';
import { Cell, EmptyState, PageHeader, StatusBadge } from '@/components/ui/layout';
import { LinkButton } from '@/components/ui/button';
import { RowLink, Table, Td, Th, Tr } from '@/components/ui/table';
import { LimitBar } from '@/features/home/panels';
import { formatDate, formatEuro } from '@/lib/format';
import { purchaseOrderStatus } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Pedidos a proveedor · Omnia' };

export default async function PurchaseOrdersPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ estado?: string }> }) {
  const { org } = await params;
  const { estado } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  const orders = await container().purchasing.list(ctx, estado ? { status: estado } : {});
  const base = `/o/${org}/compras`;
  const filters = [undefined, 'draft', 'sent', 'partially_received', 'received'] as const;
  return (
    <>
      <PageHeader
        title="Pedidos a proveedor"
        description="Pide, marca como enviado y recibe: la recepción genera el albarán de entrada."
        actions={can('purchasing.write') && <LinkButton href={`${base}/pedidos/nuevo`} variant="primary">Nuevo pedido</LinkButton>}
      />
      <Cell>
        <nav aria-label="Estado" className="mb-3 flex flex-wrap gap-2 text-sm">
          {filters.map((f) => (
            <Link key={f ?? 'all'} href={f ? `${base}?estado=${f}` : base} aria-current={estado === f ? 'true' : undefined} className="rounded-full border border-line px-3 py-1 aria-[current]:border-ink aria-[current]:bg-ink aria-[current]:text-white">
              {f ? purchaseOrderStatus[f]![0] : 'Todos'}
            </Link>
          ))}
        </nav>
        {orders.length === 0 ? (
          <EmptyState title="No hay pedidos con este filtro" />
        ) : (
          <Table minWidth={820}>
            <thead>
              <tr>
                <Th>Nº</Th>
                <Th>Proveedor</Th>
                <Th>Fecha</Th>
                <Th>Entrega prevista</Th>
                <Th align="right">Importe</Th>
                <Th>Recibido</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <Tr key={o.id}>
                  <Td><RowLink href={`${base}/pedidos/${o.id}`}>PC-{String(o.number).padStart(4, '0')}</RowLink></Td>
                  <Td>{o.supplierName}</Td>
                  <Td className="text-ink-2">{formatDate(o.orderDate)}</Td>
                  <Td className="text-ink-2">{formatDate(o.expectedOn)}</Td>
                  <Td align="right">{formatEuro(o.total)}</Td>
                  <Td className="w-32">
                    <span className="text-xs text-ink-3">{o.receivedPct} %</span>
                    <LimitBar value={o.receivedPct} tone={o.receivedPct === 100 ? 'ok' : 'neutral'} label="Recibido" />
                  </Td>
                  <Td><StatusBadge map={purchaseOrderStatus} value={o.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Cell>
    </>
  );
}
