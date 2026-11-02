'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, LayoutGrid, Lock, Package, Receipt, Wallet } from 'lucide-react';
import { initials } from '@/lib/format';
import { lock } from '@/server/actions';

export function ShiftBar({ orgName, terminalName, userName, roleName, cashOpen, manager }: {
  orgName: string;
  terminalName: string;
  userName: string;
  roleName: string;
  cashOpen: boolean;
  manager: boolean;
}) {
  const path = usePathname();
  const items = [
    { href: '/mesas', label: 'Mesas', icon: LayoutGrid, show: true },
    { href: '/tickets', label: 'Tickets', icon: Receipt, show: true },
    { href: '/caja', label: 'Caja', icon: Wallet, show: manager },
    { href: '/carta', label: 'Carta', icon: BookOpen, show: manager },
    { href: '/stock', label: 'Stock', icon: Package, show: manager },
  ].filter((i) => i.show);
  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-2 bg-ink px-2 text-white md:gap-4 md:px-4">
      <div className="hidden min-w-0 shrink lg:block">
        <p className="truncate text-sm font-bold leading-tight">{orgName}</p>
        <p className="truncate text-xs text-white/70">{terminalName}</p>
      </div>
      <nav aria-label="Secciones" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(`${href}/`) || (href === '/mesas' && path.startsWith('/cuenta'));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${active ? 'bg-white text-ink' : 'text-white/85 hover:bg-white/10'}`}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
      <span
        className={`hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold sm:flex ${cashOpen ? 'bg-ok-soft text-ok' : 'bg-warning-soft text-warning'}`}
      >
        <span aria-hidden className={`size-2 rounded-full ${cashOpen ? 'bg-ok' : 'bg-warning-line'}`} />
        {cashOpen ? 'Caja abierta' : 'Caja cerrada'}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-full bg-white text-sm font-bold text-ink" aria-hidden>
          {initials(userName)}
        </span>
        <div className="hidden leading-tight md:block">
          <p className="text-sm font-semibold">{userName}</p>
          <p className="text-xs text-white/70">{roleName}</p>
        </div>
      </div>
      <form action={lock}>
        <button type="submit" className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white/85 hover:bg-white/10" title="Bloquear el terminal">
          <Lock className="size-4" aria-hidden />
          <span className="hidden sm:inline">Bloquear</span>
        </button>
      </form>
    </header>
  );
}
