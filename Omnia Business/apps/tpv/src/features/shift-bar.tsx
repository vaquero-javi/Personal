'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, LayoutGrid, Lock, Package, Receipt, Wallet } from 'lucide-react';
import { initials } from '@/lib/format';
import { lock } from '@/server/actions';
import { ThemePicker } from './theme-picker';

/**
 * Barra del turno al estilo de iPadOS: material translúcido, pestañas en una
 * cápsula flotante en el centro, y a la derecha el estado de la caja, quién
 * está usando el terminal y el bloqueo.
 */
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
    <header className="material-bar no-print relative z-30 flex h-[60px] shrink-0 items-center gap-2 border-b border-line-soft px-3 pt-[env(safe-area-inset-top)] md:gap-3 md:px-4">
      <div className="hidden min-w-0 shrink basis-0 xl:block xl:flex-1">
        <p className="truncate text-[15px] leading-tight font-semibold">{orgName}</p>
        <p className="truncate text-[12px] text-ink-3">{terminalName}</p>
      </div>

      <nav aria-label="Secciones" className="min-w-0 flex-1 overflow-x-auto xl:flex-none">
        <ul className="mx-auto flex w-max gap-0.5 rounded-full bg-fill p-1">
          {items.map(({ href, label, icon: Icon }) => {
            const active = path === href || path.startsWith(`${href}/`) || (href === '/mesas' && path.startsWith('/cuenta'));
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`pressable flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] ${
                    active ? 'bg-sheet font-semibold text-tint shadow-[var(--shadow-raised)] dark:bg-fill-strong' : 'font-medium text-ink-2 hover:text-ink'
                  }`}
                >
                  <Icon className="size-[18px]" strokeWidth={active ? 2.3 : 2} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex shrink-0 items-center justify-end gap-2 md:gap-3 xl:flex-1 xl:basis-0">
        <span
          className={`hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold lg:flex ${cashOpen ? 'bg-ok-soft text-ok' : 'bg-warning-soft text-warning'}`}
        >
          <span aria-hidden className={`size-2 rounded-full ${cashOpen ? 'bg-sys-green' : 'bg-sys-orange'}`} />
          {cashOpen ? 'Caja abierta' : 'Caja cerrada'}
        </span>
        <div className="hidden 2xl:block">
          <ThemePicker />
        </div>
        <div className="flex shrink-0 items-center gap-2" title={`${userName} · ${roleName}`}>
          <span
            className="flex size-9 items-center justify-center rounded-full bg-gradient-to-b from-[#a1a1a6] to-[#6e6e73] text-[14px] font-semibold text-white"
            aria-hidden
          >
            {initials(userName)}
          </span>
          <div className="hidden leading-tight 2xl:block">
            <p className="text-[14px] font-semibold">{userName}</p>
            <p className="text-[12px] text-ink-3">{roleName}</p>
          </div>
        </div>
        <form action={lock}>
          <button
            type="submit"
            className="pressable flex h-10 items-center gap-2 rounded-full bg-fill px-3.5 text-[15px] font-semibold text-tint hover:bg-fill-strong"
            title="Bloquear el terminal"
          >
            <Lock className="size-[18px]" strokeWidth={2.2} aria-hidden />
            <span className="hidden sm:inline">Bloquear</span>
          </button>
        </form>
      </div>
    </header>
  );
}
