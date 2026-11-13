import Image from 'next/image';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { SignIn } from '@/features/sign-in';
import { currentAdminId } from '@/server/session';

export const metadata = { title: 'Entrar · Equipo Omnia' };

export default async function SignInPage() {
  if (await currentAdminId()) redirect('/');
  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-16 md:items-center">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center px-5 pb-6 text-center">
          <span className="relative mb-4">
            <Image src="/brand/logo.png" alt="" width={72} height={72} priority className="rounded-[18px] shadow-[var(--shadow-raised)]" />
            <span aria-hidden className="absolute -right-1.5 -bottom-1.5 flex size-7 items-center justify-center rounded-full bg-sys-gray text-white ring-[3px] ring-carton">
              <ShieldCheck className="size-4" strokeWidth={2.2} />
            </span>
          </span>
          <h1 className="text-[28px] font-bold tracking-[-0.022em]">Equipo Omnia</h1>
          <p className="mt-1 text-[15px] text-ink-3">Acceso restringido al equipo que gestiona Omnia.</p>
        </div>
        <div className="overflow-hidden rounded-[20px] bg-sheet shadow-[var(--shadow-card)]">
          <SignIn />
        </div>
        <p className="mt-4 px-5 text-center text-[12px] text-ink-3">
          No es el acceso de las empresas. Si usas Omnia en tu empresa, entra desde la web.
        </p>
      </div>
    </main>
  );
}
