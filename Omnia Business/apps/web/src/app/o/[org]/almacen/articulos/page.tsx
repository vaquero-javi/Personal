import { Badge, Cell, EmptyState, PageHeader } from '@/components/ui/layout';
import { LinkButton } from '@/components/ui/button';
import { RowLink, Table, Td, Th, Tr } from '@/components/ui/table';
import { inputClass } from '@/components/ui/form';
import { formatEuro, formatQty } from '@/lib/format';
import { itemType } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Artículos · Omnia' };

export default async function ItemsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ q?: string }> }) {
  const { org } = await params;
  const { q } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  const items = await container().warehouse.items(ctx, q ? { search: q } : {});
  const base = `/o/${org}/almacen/articulos`;

  return (
    <>
      <PageHeader
        title="Artículos"
        description={`${items.length} artículos en el catálogo`}
        actions={can('inventory.write') && <LinkButton href={`${base}/nuevo`} variant="primary">Nuevo artículo</LinkButton>}
      />
      <Cell>
        <form className="mb-3 flex max-w-md gap-2" role="search">
          <label htmlFor="q" className="sr-only">Buscar artículo</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Nombre, referencia o código de barras" className={inputClass} />
        </form>
        {items.length === 0 ? (
          <EmptyState title={q ? 'Ningún artículo coincide' : 'Aún no hay artículos'} action={can('inventory.write') && !q ? <LinkButton href={`${base}/nuevo`}>Crear el primero</LinkButton> : undefined}>
            {q ? 'Prueba con otra referencia o parte del nombre.' : 'Los artículos son la base de compras, ventas, TPV y almacén.'}
          </EmptyState>
        ) : (
          <Table minWidth={720}>
            <thead>
              <tr>
                <Th>Artículo</Th>
                <Th>Tipo</Th>
                <Th align="right">Existencias</Th>
                <Th align="right">Coste medio</Th>
                <Th align="right">IVA</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <Tr key={i.id}>
                  <Td>
                    <RowLink href={`${base}/${i.id}`}>{i.name}</RowLink>
                    <span className="block text-xs text-ink-3">{i.sku}{!i.isActive && ' · inactivo'}</span>
                  </Td>
                  <Td className="text-ink-2">{itemType[i.itemType]}</Td>
                  <Td align="right">
                    {i.itemType === 'stockable' ? (
                      <>
                        <span className={i.belowMinimum ? 'font-semibold text-danger' : ''}>{formatQty(i.onHand)}</span> <span className="text-ink-3">{i.unitOfMeasure}</span>
                        {i.belowMinimum && <span className="ml-2"><Badge tone="danger">Bajo mínimo</Badge></span>}
                      </>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </Td>
                  <Td align="right" className="text-ink-2">{i.itemType === 'stockable' ? formatEuro(i.avgUnitCost) : '—'}</Td>
                  <Td align="right" className="text-ink-2">{Number(i.defaultTaxRate)} %</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Cell>
    </>
  );
}
