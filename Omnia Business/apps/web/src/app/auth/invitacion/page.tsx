import Image from 'next/image';
import { ActionForm, Notice, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { activateAccess } from './actions';

export const metadata = { title: 'Activa tu acceso · Omnia' };

type Search = { token_hash?: string; type?: string; dev?: string };

/**
 * Destino del botón del correo de invitación. El enlace no se canjea al abrir
 * la página (los antivirus de correo abren los enlaces), sino al enviar el formulario.
 */
export default async function InvitationPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { token_hash: tokenHash, type, dev } = await searchParams;
  const valid = process.env.AUTH_MODE === 'dev' ? Boolean(dev) : Boolean(tokenHash && (type === 'invite' || type === 'magiclink'));
  return (
    <main className="flex min-h-dvh items-start justify-center bg-carton px-4 py-16 md:items-center">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center px-5 pb-6 text-center">
          <Image src="/brand/logo.png" alt="" width={72} height={72} priority className="mb-4 rounded-[18px] shadow-[var(--shadow-raised)]" />
          <h1 className="text-[28px] font-bold tracking-[-0.022em]">Activa tu acceso</h1>
          <p className="mt-1 text-[15px] text-ink-3">Elige una contraseña y entrarás con las sociedades y permisos que te han dado.</p>
        </div>
        <div className="rounded-[20px] bg-sheet p-5 shadow-[var(--shadow-card)]">
          {valid ? (
            <ActionForm action={activateAccess} className="flex flex-col gap-3">
              {tokenHash && <input type="hidden" name="tokenHash" value={tokenHash} />}
              {type && <input type="hidden" name="type" value={type} />}
              {dev && <input type="hidden" name="dev" value={dev} />}
              <TextField label="Contraseña" name="password" type="password" autoComplete="new-password" required minLength={8} hint="Mínimo 8 caracteres" />
              <TextField label="Repite la contraseña" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
              <SubmitButton className="h-10" pendingLabel="Activando…">Activar y entrar</SubmitButton>
            </ActionForm>
          ) : (
            <Notice tone="danger">Este enlace no es válido. Ábrelo de nuevo desde el correo o pide que te reenvíen la invitación.</Notice>
          )}
        </div>
      </div>
    </main>
  );
}
