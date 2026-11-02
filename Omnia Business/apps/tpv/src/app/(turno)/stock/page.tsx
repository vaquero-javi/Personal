import { container } from '@/server/container';
import { requireShift } from '@/server/session';
import { Notice } from '@/components/ui';
import { StockTable } from '@/features/menu/stock-table';

export const metadata = { title: 'Stock · Omnia TPV' };

export default async function StockPage() {
  const { ctx, terminal, can } = await requireShift();
  if (!can('pos.manage')) return <div className="p-6"><Notice tone="warning">El stock lo gestiona un encargado.</Notice></div>;
  const ingredients = await container().recipes.ingredients(ctx, terminal.warehouseId);
  return <StockTable ingredients={ingredients} warehouseName={terminal.warehouseName} allowNegative={terminal.allowNegativeStock} />;
}
