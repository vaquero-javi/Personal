import { container } from '@/server/container';
import { requireShift } from '@/server/session';
import { CashDesk } from '@/features/cash/cash-desk';
import { Notice } from '@/components/ui';

export const metadata = { title: 'Caja · Omnia TPV' };

export default async function CashPage() {
  const { ctx, terminal, can } = await requireShift();
  if (!can('pos.manage')) {
    return (
      <div className="p-6">
        <Notice tone="warning">La caja la gestiona un encargado.</Notice>
      </div>
    );
  }
  const [session, history] = await Promise.all([container().pos.cashSession(ctx, terminal.terminalId), container().pos.cashHistory(ctx, terminal.terminalId)]);
  const [movements, tickets] = session
    ? await Promise.all([container().pos.cashMovements(ctx, session.id), container().pos.cashTickets(ctx, session.id)])
    : [[], []];
  const floor = session ? await container().pos.floor(ctx) : null;
  const openTabs = floor ? floor.tables.filter((t) => t.tab).length + floor.counterTabs.length : 0;
  return <CashDesk terminalName={terminal.terminalName} session={session} movements={movements} tickets={tickets} history={history} openTabs={openTabs} />;
}
