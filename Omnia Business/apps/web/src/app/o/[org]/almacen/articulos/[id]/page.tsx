import { Cell, EmptyState, PageHeader, Ruled } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ItemForm } from '@/features/inventory/item-form';
import { formatDateTime, formatEuro, formatQty } from '@/lib/format';
import { itemType, movementType } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { saveItem } from '../../actions';

export default async function ItemPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const { ctx, can } = await requireOrg(org);
  const [{ item, levels, movements }, fields] = await Promise.all([
    container().warehouse.item(ctx, id),
    container().organizations.customFields(ctx),
  ]);
  const customFields = fields.filter((f) => f.entity === 'inventory_item');
  const total = levels.reduce((s, l) => s + Number(l.onHand), 0);

  return (
    <>
      <PageHeader
        title={item.name}
        description={`${item.sku} · ${itemType[item.itemType]}${item.itemType === 'stockable' ? ` · ${formatQty(total)} ${item.unitOfMeasure} en total` : ''}`}
        back={{ href: `/o/${org}/almacen/articulos`, label: 'Artículos' }}
      />
      <Ruled cols="lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Cell title="Ficha">
          {can('inventory.write') ? (
            <ItemForm action={saveItem.bind(null, org, item.id)} item={item} customFields={customFields} />
          ) : (
            <p className="text-sm text-ink-2">Solo lectura: tu rol no puede editar artículos.</p>
          )}
        </Cell>
        <Cell title="Existencias por almacén">
          {item.itemType !== 'stockable' ? (
            <EmptyState title="Sin stock">Los servicios y consumibles no llevan control de existencias.</EmptyState>
          ) : (
            <ul className="divide-y divide-line-soft text-sm">
              {levels.map((l) => (
                <li key={l.warehouseId} className="flex items-baseline justify-between gap-3 py-2">
                  <span>{l.warehouseName}</span>
                  <span className="text-right">
                    <b className={l.belowMinimum ? 'text-danger' : ''}>{formatQty(l.onHand)}</b> <span className="text-ink-3">/ mín. {formatQty(l.minQuantity)}</span>
                    <span className="block text-xs text-ink-3">coste medio {formatEuro(l.avgUnitCost)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cell>
      </Ruled>
      <Cell title="Últimos movimientos">
        {movements.length === 0 ? (
          <EmptyState title="Sin movimientos">Aparecerán las entradas, ventas, ajustes y traspasos de este artículo.</EmptyState>
        ) : (
          <Table minWidth={680}>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Tipo</Th>
                <Th>Almacén</Th>
                <Th align="right">Cantidad</Th>
                <Th>Nota</Th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <Tr key={m.id}>
                  <Td className="whitespace-nowrap text-ink-2">{formatDateTime(m.occurredAt)}</Td>
                  <Td>{movementType[m.movementType]}</Td>
                  <Td className="text-ink-2">{m.warehouseName}</Td>
                  <Td align="right" className={Number(m.quantity) < 0 ? 'text-danger' : 'text-ok'}>
                    {Number(m.quantity) > 0 ? '+' : ''}
                    {formatQty(m.quantity)}
                  </Td>
                  <Td className="text-ink-3">{m.note ?? ''}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Cell>
    </>
  );
}
