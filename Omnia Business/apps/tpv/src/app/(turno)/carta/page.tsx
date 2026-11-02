import { container } from '@/server/container';
import { requireShift } from '@/server/session';
import { Notice } from '@/components/ui';
import { MenuTable } from '@/features/menu/menu-table';

export const metadata = { title: 'Carta · Omnia TPV' };

export default async function MenuPage() {
  const { ctx, terminal, can } = await requireShift();
  if (!can('pos.manage')) return <div className="p-6"><Notice tone="warning">La carta y los escandallos los gestiona un encargado.</Notice></div>;
  const [products, categories, ingredients] = await Promise.all([
    container().recipes.products(ctx, terminal.warehouseId),
    container().pos.categories(ctx),
    container().recipes.ingredients(ctx, terminal.warehouseId),
  ]);
  const onMenu = new Set(products.map((p) => p.id));
  return (
    <MenuTable
      products={products}
      categories={categories.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name }))}
      candidates={ingredients.filter((i) => !onMenu.has(i.id)).map((i) => ({ id: i.id, name: i.name }))}
    />
  );
}
