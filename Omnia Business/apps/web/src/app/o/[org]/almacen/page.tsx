import Link from 'next/link';
import { Badge, Cell, EmptyState, PageHeader } from '@/components/ui/layout';
import { LinkButton } from '@/components/ui/button';
import { RowLink, Table, Td, Th, Tr } from '@/components/ui/table';
import { MinimumEditor } from '@/features/inventory/minimum-editor';
import { formatEuro, formatQty } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { setMinimum } from './actions';

export const metadata = { title: 'Existencias · Omnia' };

export default async function StockPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ almacen?: string; bajo?: string }> }) {
  const { org } = await params;
  const { almacen, bajo } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  const [warehouses, stock] = await Promise.all([
    container().warehouse.warehouses(ctx),
    container().warehouse.stock(ctx, { ...(almacen ? { warehouseId: almacen } : {}), onlyBelowMinimum: bajo === '1' }),
  ]);
  const base = `/o/${org}/almacen`;
  const below = stock.filter((s) => s.belowMinimum).length;
  const value = stock.reduce((sum, s) => sum + Number(s.onHand) * Number(s.avgUnitCost), 0);
  const query = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ ...(almacen ? { almacen } : {}), ...(bajo ? { bajo } : {}) });
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <>
      <PageHeader
        title="Existencias"
        description={`${stock.length} saldos · valorado a coste medio ${formatEuro(value)}${below ? ` · ${below} bajo mínimos` : ''}`}
        actions={
          can('inventory.post') && (
            <LinkButton href={`${base}/movimientos`} variant="secondary">
              Ajustar o traspasar
            </LinkButton>
          )
        }
      />
      <Cell>
        <nav aria-label="Filtros" className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <Link href={query({ almacen: undefined })} aria-current={!almacen ? 'true' : undefined} className="rounded-full border border-line px-3 py-1 aria-[current]:border-ink aria-[current]:bg-ink aria-[current]:text-white">
            Todos los almacenes
          </Link>
          {warehouses.map((w) => (
            <Link key={w.id} href={query({ almacen: w.id })} aria-current={almacen === w.id ? 'true' : undefined} className="rounded-full border border-line px-3 py-1 aria-[current]:border-ink aria-[current]:bg-ink aria-[current]:text-white">
              {w.name}
            </Link>
          ))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <Link href={query({ bajo: bajo === '1' ? undefined : '1' })} aria-current={bajo === '1' ? 'true' : undefined} className="rounded-full border border-line px-3 py-1 aria-[current]:border-danger aria-[current]:bg-danger-soft aria-[current]:text-danger">
            Solo bajo mínimos
          </Link>
        </nav>
        {stock.length === 0 ? (
          <EmptyState title={bajo ? 'Nada bajo mínimos' : 'Sin existencias todavía'}>
            {bajo ? 'Todos los artículos de este filtro están por encima de su mínimo.' : 'Las existencias aparecen al contabilizar la primera entrada de mercancía.'}
          </EmptyState>
        ) : (
          <Table minWidth={760}>
            <thead>
              <tr>
                <Th>Artículo</Th>
                <Th>Almacén</Th>
                <Th align="right">Existencias</Th>
                <Th align="right">Mínimo</Th>
                <Th align="right">Coste medio</Th>
                <Th align="right">Valor</Th>
              </tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <Tr key={`${s.itemId}-${s.warehouseId}`}>
                  <Td>
                    <RowLink href={`${base}/articulos/${s.itemId}`}>{s.itemName}</RowLink>
                    <span className="block text-xs text-ink-3">{s.sku}</span>
                  </Td>
                  <Td className="text-ink-2">{s.warehouseName}</Td>
                  <Td align="right">
                    <span className={s.belowMinimum ? 'font-semibold text-danger' : 'font-semibold'}>{formatQty(s.onHand)}</span>{' '}
                    <span className="text-ink-3">{s.unitOfMeasure}</span>
                    {s.belowMinimum && (
                      <span className="ml-2">
                        <Badge tone="danger">Bajo mínimo</Badge>
                      </span>
                    )}
                  </Td>
                  <Td align="right" className="relative z-10">
                    {can('inventory.write') ? (
                      <MinimumEditor action={setMinimum.bind(null, org)} warehouseId={s.warehouseId} itemId={s.itemId} value={s.minQuantity} />
                    ) : (
                      formatQty(s.minQuantity)
                    )}
                  </Td>
                  <Td align="right" className="text-ink-2">{formatEuro(s.avgUnitCost)}</Td>
                  <Td align="right">{formatEuro(Number(s.onHand) * Number(s.avgUnitCost))}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Cell>
    </>
  );
}
