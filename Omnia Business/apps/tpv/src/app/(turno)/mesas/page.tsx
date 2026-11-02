import { container } from '@/server/container';
import { requireShift } from '@/server/session';
import { FloorMap } from '@/features/floor-map';

export const metadata = { title: 'Mesas · Omnia TPV' };

export default async function TablesPage() {
  const { ctx, terminal, user, can } = await requireShift();
  const [floor, cash] = await Promise.all([container().pos.floor(ctx), container().pos.cashSession(ctx, terminal.terminalId)]);
  return <FloorMap tables={floor.tables} counterTabs={floor.counterTabs} cashOpen={cash !== null} manager={can('pos.manage')} userId={user.id} />;
}
