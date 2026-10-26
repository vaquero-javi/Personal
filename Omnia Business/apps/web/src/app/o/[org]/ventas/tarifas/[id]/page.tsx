import { Cell, PageHeader } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { PriceEditor } from '@/features/sales/price-editor';
import { formatEuro } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { setPrice } from '../../actions';

export default async function PriceListPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const { ctx, can } = await requireOrg(org);
  const [lists, items] = await Promise.all([container().parties.priceLists(ctx), container().parties.priceListItems(ctx, id)]);
  const list = lists.find((l) => l.id === id);
  return (
    <>
      <PageHeader title={`Tarifa ${list?.name ?? ''}`} description="Precio unitario sin IVA. Vacía un precio para quitar el artículo de la tarifa." back={{ href: `/o/${org}/ventas/tarifas`, label: 'Tarifas' }} />
      <Cell>
        <Table minWidth={520}>
          <thead>
            <tr>
              <Th>Artículo</Th>
              <Th align="right">Precio sin IVA</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <Tr key={i.itemId}>
                <Td>
                  {i.name}
                  <span className="block text-xs text-ink-3">{i.sku}</span>
                </Td>
                <Td align="right">
                  {can('parties.write') ? (
                    <PriceEditor action={setPrice.bind(null, org, id, i.itemId)} value={i.unitPrice} label={`Precio de ${i.name}`} />
                  ) : i.unitPrice ? (
                    formatEuro(i.unitPrice)
                  ) : (
                    '—'
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Cell>
    </>
  );
}
