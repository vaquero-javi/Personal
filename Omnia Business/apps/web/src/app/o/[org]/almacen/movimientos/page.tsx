import { Cell, EmptyState, PageHeader, Ruled } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { AdjustmentForm } from '@/features/inventory/adjustment-form';
import { formatDateTime, formatEuro, formatQty } from '@/lib/format';
import { movementType } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { adjustStock } from '../actions';

export const metadata = { title: 'Movimientos · Omnia' };

export default async function MovementsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can } = await requireOrg(org);
  const [movements, items, warehouses] = await Promise.all([
    container().warehouse.movements(ctx),
    container().warehouse.items(ctx),
    container().warehouse.warehouses(ctx),
  ]);

  return (
    <>
      <PageHeader title="Movimientos y ajustes" description="El libro de stock: cada entrada y salida queda registrada y no se puede editar." />
      <Ruled cols="xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell title="Últimos movimientos">
          {movements.length === 0 ? (
            <EmptyState title="Sin movimientos todavía" />
          ) : (
            <Table minWidth={760}>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Artículo</Th>
                  <Th>Tipo</Th>
                  <Th>Almacén</Th>
                  <Th align="right">Cantidad</Th>
                  <Th align="right">Coste</Th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <Tr key={m.id}>
                    <Td className="whitespace-nowrap text-ink-2">{formatDateTime(m.occurredAt)}</Td>
                    <Td>
                      {m.itemName}
                      {m.note && <span className="block text-xs text-ink-3">{m.note}</span>}
                    </Td>
                    <Td>{movementType[m.movementType]}</Td>
                    <Td className="text-ink-2">{m.warehouseName}</Td>
                    <Td align="right" className={Number(m.quantity) < 0 ? 'text-danger' : 'text-ok'}>
                      {Number(m.quantity) > 0 ? '+' : ''}
                      {formatQty(m.quantity)}
                    </Td>
                    <Td align="right" className="text-ink-2">{m.unitCost ? formatEuro(m.unitCost) : '—'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Cell>
        <Cell title="Ajuste o traspaso">
          {can('inventory.post') ? (
            <AdjustmentForm
              action={adjustStock.bind(null, org)}
              items={items.filter((i) => i.itemType === 'stockable').map((i) => ({ value: i.id, label: `${i.sku} · ${i.name}` }))}
              warehouses={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
          ) : (
            <p className="text-sm text-ink-2">Tu rol no puede registrar movimientos de stock.</p>
          )}
        </Cell>
      </Ruled>
    </>
  );
}
