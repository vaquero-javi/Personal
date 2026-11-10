import { notFound } from 'next/navigation';
import { isDomainError } from '@omnia/core';
import { Cell, PageHeader } from '@/components/ui/layout';
import { Notice } from '@/components/ui/form';
import { RecipeEditor } from '@/features/pos/recipe-editor';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { saveRecipe } from '../../../actions';
import { menuWarehouse } from '../warehouse';

export const metadata = { title: 'Escandallo · Sala y carta · Omnia' };

export default async function PosRecipePage({ params, searchParams }: { params: Promise<{ org: string; id: string }>; searchParams: Promise<{ almacen?: string }> }) {
  const { org, id } = await params;
  const { almacen } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  const back = { href: `/o/${org}/ajustes/tpv/carta`, label: 'Sala y carta' };
  const { selected } = await menuWarehouse(ctx, almacen);
  if (!can('pos.manage') || !selected) {
    return (
      <>
        <PageHeader title="Escandallo" back={back} />
        <Cell>
          <Notice tone="warning">{selected ? 'Los escandallos los gestiona quien tenga el permiso de encargado de TPV.' : 'Crea antes un almacén.'}</Notice>
        </Cell>
      </>
    );
  }
  const [product, ingredients] = await Promise.all([
    container().recipes.get(ctx, id, selected.id).catch((e) => {
      if (isDomainError(e) && (e.code === 'NOT_FOUND' || e.code === 'VALIDATION')) notFound();
      throw e;
    }),
    container().recipes.ingredients(ctx, selected.id),
  ]);
  return (
    <>
      <PageHeader title={product.name} description="Escandallo: ingredientes y cantidades por unidad vendida." back={back} />
      <RecipeEditor product={product} ingredients={ingredients.filter((i) => i.id !== id)} warehouseName={selected.name} save={saveRecipe.bind(null, org, id)} />
    </>
  );
}
