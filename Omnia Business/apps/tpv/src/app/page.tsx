import { container } from '@/server/container';
import { requireTerminal, terminalToken } from '@/server/session';
import { LockScreen } from '@/features/lock-screen';

export const metadata = { title: 'Entrar · Omnia TPV' };
export const dynamic = 'force-dynamic';

/** Pantalla de bloqueo: elige quién eres y teclea tu PIN. */
export default async function LockPage() {
  const terminal = await requireTerminal();
  const staff = await container().pos.staff(await terminalToken());
  return <LockScreen orgName={terminal.orgName} terminalName={terminal.terminalName} staff={staff} />;
}
