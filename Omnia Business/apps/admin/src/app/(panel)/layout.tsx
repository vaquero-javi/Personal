import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { LogOut, ShieldCheck } from 'lucide-react';
import { OrgSearch } from '@/features/org-search';
import { requireAdmin } from '@/server/session';

/** Todo el panel exige sesión del equipo (requireAdmin): se comprueba en cada petición. */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const { name } = await requireAdmin();
  return (
    <main className="min-h-dvh">
      <header className="material-bar sticky top-0 z-20 border-b border-line-soft pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-[52px] w-full max-w-[1180px] items-center gap-2.5 px-4 md:px-8">
          <span aria-hidden className="flex size-[26px] items-center justify-center rounded-[7px] bg-sys-gray text-white">
            <ShieldCheck className="size-[15px]" strokeWidth={2.2} />
          </span>
          <Link href="/" className="shrink-0 truncate text-[15px] font-semibold">Equipo Omnia</Link>
          <div className="flex min-w-0 flex-1 justify-center px-1">
            <Suspense fallback={null}>
              <OrgSearch />
            </Suspense>
          </div>
          <span className="hidden truncate text-[13px] text-ink-3 sm:inline">{name}</span>
          <form action="/salir" method="post">
            <button type="submit" aria-label="Salir" title="Salir" className="pressable flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-fill hover:text-ink">
              <LogOut aria-hidden className="size-4" />
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 pt-2 pb-16 md:gap-5 md:px-8">{children}</div>
    </main>
  );
}
