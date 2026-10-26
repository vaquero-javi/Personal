import Link from 'next/link';
import { Cell, Facts, PageHeader, Ruled, StatusBadge } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { LimitBar } from '@/features/home/panels';
import { formatDate, formatDateTime, formatEuro, formatQty, percent } from '@/lib/format';
import { purchaseOrderStatus, receiptStatus } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { cancelPurchaseOrder, receivePurchaseOrder, sendPurchaseOrder } from '../../actions';

export default async function PurchaseOrderPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const { ctx, can } = await requireOrg(org);
  const po = await container().purchasing.get(ctx, id);
  const number = `PC-${String(po.number).padStart(4, '0')}`;
  const canReceive = ['sent', 'partially_received'].includes(po.status) && can('inventory.write');

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">Pedido {number} <StatusBadge map={purchaseOrderStatus} value={po.status} /></span>}
        description={`${po.supplierName} · entrega en ${po.warehouseName}`}
        back={{ href: `/o/${org}/compras`, label: 'Pedidos' }}
      />
      <Ruled cols="xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell title="Líneas">
          <Table minWidth={640}>
            <thead>
              <tr>
                <Th>Artículo</Th>
                <Th align="right">Pedido</Th>
                <Th align="right">Recibido</Th>
                <Th align="right">Coste ud.</Th>
                <Th align="right">Importe</Th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l) => (
                <Tr key={l.id}>
                  <Td>
                    {l.itemName}
                    <span className="block text-xs text-ink-3">{l.sku}</span>
                  </Td>
                  <Td align="right">{formatQty(l.quantity)} <span className="text-ink-3">{l.unitOfMeasure}</span></Td>
                  <Td align="right" className="w-36">
                    {formatQty(l.receivedQuantity)}
                    <LimitBar value={percent(l.receivedQuantity, l.quantity)} tone={Number(l.receivedQuantity) >= Number(l.quantity) ? 'ok' : 'neutral'} label={`Recibido de ${l.itemName}`} />
                  </Td>
                  <Td align="right">{formatEuro(l.unitCost)}</Td>
                  <Td align="right">{formatEuro(Number(l.quantity) * Number(l.unitCost))}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-3 text-right text-sm">Total del pedido <b className="ml-3 text-base">{formatEuro(po.total)}</b></p>
        </Cell>
        <Cell title="Datos y acciones">
          <Facts
            items={[
              ['Fecha', formatDate(po.orderDate)],
              ['Entrega prevista', formatDate(po.expectedOn)],
              [
                'Recibido',
                <span key="r" className="block">
                  {po.receivedPct} %
                  <LimitBar value={po.receivedPct} tone={po.receivedPct === 100 ? 'ok' : 'neutral'} label="Recibido sobre pedido" />
                </span>,
              ],
              ['Notas', po.notes],
            ]}
          />
          <div className="mt-5 flex flex-col gap-4 border-t border-line pt-4">
            {po.status === 'draft' && can('purchasing.write') && (
              <ActionForm action={sendPurchaseOrder.bind(null, org, po.id)}>
                <p className="mb-2 text-sm text-ink-2">Revisa las líneas y márcalo como enviado cuando se lo hayas pasado al proveedor.</p>
                <SubmitButton>Marcar como enviado</SubmitButton>
              </ActionForm>
            )}
            {canReceive && (
              <ActionForm action={receivePurchaseOrder.bind(null, org, po.id)} className="flex flex-col gap-3">
                <p className="text-sm text-ink-2">Llega la mercancía: se crea un albarán en borrador con lo pendiente, que podrás ajustar antes de contabilizar.</p>
                <TextField label="Nº de albarán del proveedor" name="supplierDeliveryNote" required />
                <div>
                  <SubmitButton pendingLabel="Preparando…">Recibir mercancía</SubmitButton>
                </div>
              </ActionForm>
            )}
            {['draft', 'sent'].includes(po.status) && can('purchasing.write') && (
              <ActionForm action={cancelPurchaseOrder.bind(null, org, po.id)}>
                <SubmitButton variant="danger" pendingLabel="Anulando…">Anular pedido</SubmitButton>
              </ActionForm>
            )}
          </div>
        </Cell>
      </Ruled>
      {po.receipts.length > 0 && (
        <Cell title="Albaranes de este pedido">
          <ul className="divide-y divide-line-soft text-sm">
            {po.receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/o/${org}/almacen/albaranes/${r.id}`} className="font-medium underline-offset-2 hover:underline">
                  Albarán {String(r.number).padStart(5, '0')}
                </Link>
                <span className="flex items-center gap-3 text-ink-2">
                  {formatDateTime(r.receivedAt)} <StatusBadge map={receiptStatus} value={r.status} />
                </span>
              </li>
            ))}
          </ul>
        </Cell>
      )}
    </>
  );
}
