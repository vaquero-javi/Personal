import { notFound } from 'next/navigation';
import { isDomainError } from '@omnia/core';
import { container } from '@/server/container';
import { requireShift } from '@/server/session';
import { Notice } from '@/components/ui';
import { RecipeEditor } from '@/features/menu/recipe-editor';

export const metadata = { title: 'Escandallo · Omnia TPV' };

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, terminal, can } = await requireShift();
  if (!can('pos.manage')) return <div className="p-6"><Notice tone="warning">Los escandallos los gestiona un encargado.</Notice></div>;
  const [product, ingredients] = await Promise.all([
    container().recipes.get(ctx, id, terminal.warehouseId).catch((e) => {
      if (isDomainError(e) && (e.code === 'NOT_FOUND' || e.code === 'VALIDATION')) notFound();
      throw e;
    }),
    container().recipes.ingredients(ctx, terminal.warehouseId),
  ]);
  return <RecipeEditor product={product} ingredients={ingredients.filter((i) => i.id !== id)} warehouseName={terminal.warehouseName} />;
}
