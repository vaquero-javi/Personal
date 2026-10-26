import Link from 'next/link';
import { Cell, Facts, PageHeader, Ruled, StatusBadge } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, Notice, SelectField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { formatDate, formatDateTime, formatEuro, formatQty } from '@/lib/format';
import { salesOrderStatus } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { cancelSalesOrder, confirmSalesOrder, deliverSalesOrder, invoiceSalesOrder } from '../../actions';

export default async function SalesOrderPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const { ctx, can } = await requireOrg(org);
  const so = await container().sales.get(ctx, id);
  const series = so.status === 'delivered' ? (await container().invoicing.series(ctx)).filter((s) => s.isActive && s.invoiceKind === 'standard') : [];
  const short = so.lines.filter((l) => Number(l.onHand) < Number(l.quantity));
  const number = `PV-${String(so.number).padStart(4, '0')}`;

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">Pedido {number} <StatusBadge map={salesOrderStatus} value={so.status} /></span>}
        description={`${so.customerName}${so.priceListName ? ` · tarifa ${so.priceListName}` : ''} · sale de ${so.warehouseName}`}
        back={{ href: `/o/${org}/ventas`, label: 'Pedidos' }}
      />
      <Ruled cols="xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell title="Líneas">
          <Table minWidth={680}>
            <thead>
              <tr>
                <Th>Artículo</Th>
                <Th align="right">Cantidad</Th>
                <Th align="right">Disponible</Th>
                <Th align="right">Precio</Th>
                <Th align="right">Dto.</Th>
                <Th align="right">Base</Th>
              </tr>
            </thead>
            <tbody>
              {so.lines.map((l) => {
                const lacking = so.status === 'confirmed' && Number(l.onHand) < Number(l.quantity);
                return (
                  <Tr key={l.id}>
                    <Td>
                      {l.description}
                      <span className="block text-xs text-ink-3">{l.sku}</span>
                    </Td>
                    <Td align="right">{formatQty(l.quantity)}</Td>
                    <Td align="right" className={lacking ? 'font-semibold text-danger' : 'text-ink-2'}>{formatQty(l.onHand)}</Td>
                    <Td align="right">{formatEuro(l.unitPrice)}</Td>
                    <Td align="right" className="text-ink-2">{Number(l.discountPct) ? `${Number(l.discountPct)} %` : '—'}</Td>
                    <Td align="right">{formatEuro(Number(l.quantity) * Number(l.unitPrice) * (1 - Number(l.discountPct) / 100))}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          <dl className="mt-4 ml-auto grid max-w-64 grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
            <dt className="text-ink-3">Base</dt>
            <dd className="text-right">{formatEuro(so.base)}</dd>
            <dt className="font-semibold">Total con IVA</dt>
            <dd className="text-right text-base font-bold">{formatEuro(so.total)}</dd>
          </dl>
        </Cell>
        <Cell title="Datos y acciones">
          <Facts
            items={[
              ['Fecha', formatDate(so.orderDate)],
              ['Servido', so.deliveredAt ? formatDateTime(so.deliveredAt) : null],
              ['Factura', so.invoiceId ? <Link key="f" className="underline-offset-2 hover:underline" href={`/o/${org}/facturacion/${so.invoiceId}`}>{so.invoiceNumber}</Link> : null],
              ['Notas', so.notes],
            ]}
          />
          <div className="mt-5 flex flex-col gap-4 border-t border-line pt-4">
            {so.status === 'draft' && can('sales.write') && (
              <ActionForm action={confirmSalesOrder.bind(null, org, so.id)}>
                <SubmitButton>Confirmar pedido</SubmitButton>
              </ActionForm>
            )}
            {so.status === 'confirmed' && (
              can('inventory.post') ? (
                <ActionForm action={deliverSalesOrder.bind(null, org, so.id)}>
                  {short.length > 0 && <Notice tone="warning">No hay existencias suficientes de {short.map((l) => l.sku).join(', ')}. Recibe mercancía antes de servir.</Notice>}
                  <p className="mb-2 text-sm text-ink-2">Al servir, la mercancía sale del almacén.</p>
                  <SubmitButton pendingLabel="Sirviendo…">Servir pedido</SubmitButton>
                </ActionForm>
              ) : (
                <Notice tone="warning">Pendiente de que almacén lo sirva.</Notice>
              )
            )}
            {so.status === 'delivered' && can('invoicing.issue') && (
              <ActionForm action={invoiceSalesOrder.bind(null, org, so.id)} className="flex flex-col gap-3">
                <p className="text-sm text-ink-2">Crea la factura con estas líneas y la emite (numeración y huella VeriFactu).</p>
                <SelectField label="Serie" name="seriesId" options={series.map((s) => ({ value: s.id, label: `${s.code} · ${s.fiscalYear} (siguiente nº ${s.nextNumber})` }))} />
                <div>
                  <SubmitButton pendingLabel="Facturando…">Facturar pedido</SubmitButton>
                </div>
              </ActionForm>
            )}
            {['draft', 'confirmed'].includes(so.status) && can('sales.write') && (
              <ActionForm action={cancelSalesOrder.bind(null, org, so.id)}>
                <SubmitButton variant="danger" pendingLabel="Anulando…">Anular pedido</SubmitButton>
              </ActionForm>
            )}
          </div>
        </Cell>
      </Ruled>
    </>
  );
}
