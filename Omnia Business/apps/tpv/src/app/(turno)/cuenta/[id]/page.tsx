import { notFound, redirect } from 'next/navigation';
import { isDomainError } from '@omnia/core';
import { container } from '@/server/container';
import { requireShift } from '@/server/session';
import { TabScreen } from '@/features/tab/tab-screen';

export const metadata = { title: 'Cuenta · Omnia TPV' };

export default async function TabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, terminal, can } = await requireShift();
  const tab = await container().pos.tab(ctx, id).catch((e) => {
    if (isDomainError(e) && (e.code === 'NOT_FOUND' || e.code === 'VALIDATION')) notFound();
    throw e;
  });
  if (tab.status === 'cancelled') redirect('/mesas');
  const [menu, floor, cash] = await Promise.all([
    container().pos.menu(ctx, terminal.warehouseId),
    container().pos.floor(ctx),
    container().pos.cashSession(ctx, terminal.terminalId),
  ]);
  return (
    <TabScreen
      tab={tab}
      categories={menu.categories}
      products={menu.products}
      freeTables={floor.tables.filter((t) => !t.tab).map((t) => ({ id: t.id, name: t.name, area: t.area }))}
      cashOpen={cash !== null}
      manager={can('pos.manage')}
      allowNegativeStock={terminal.allowNegativeStock}
    />
  );
}
