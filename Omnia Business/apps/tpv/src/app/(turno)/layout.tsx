import type { ReactNode } from 'react';
import { container } from '@/server/container';
import { requireShift } from '@/server/session';
import { ShiftBar } from '@/features/shift-bar';
import { IdleLock } from '@/features/idle-lock';

export const dynamic = 'force-dynamic';

export default async function ShiftLayout({ children }: { children: ReactNode }) {
  const { terminal, ctx, user, can } = await requireShift();
  const cash = await container().pos.cashSession(ctx, terminal.terminalId);
  const manager = can('pos.manage');
  return (
    <div className="flex h-dvh flex-col">
      <ShiftBar
        orgName={terminal.orgName}
        terminalName={terminal.terminalName}
        userName={user.name}
        roleName={user.roleName}
        cashOpen={cash !== null}
        manager={manager}
      />
      <IdleLock minutes={Number(process.env.POS_IDLE_LOCK_MINUTES ?? 10)} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
