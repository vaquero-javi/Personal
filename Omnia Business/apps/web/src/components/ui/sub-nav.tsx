'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FeatureGate } from '@/components/entitlements/feature-gate';

export interface SubNavItem {
  href: string;
  label: string;
  count?: number;
  /** Submódulo contratado que exige (p. ej. 'purchasing.price_comparison'). */
  feature?: string;
}

/**
 * Secciones de un módulo como control segmentado (segmented control).
 * Las que dependen de un submódulo no contratado se ocultan, o salen con candado
 * si `upsell` (quien gestiona la sociedad puede pedirlas).
 */
export function SubNav({ base, items, upsell = false }: { base: string; items: SubNavItem[]; upsell?: boolean }) {
  const pathname = usePathname();
  const matches = (href: string) => {
    const full = href ? `${base}/${href}` : base;
    return href === '' ? pathname === base : pathname === full || pathname.startsWith(`${full}/`);
  };
  // Con secciones anidadas (nominas y nominas/personal) gana la más concreta.
  const current = items.filter((i) => matches(i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const active = (href: string) => href === current;
  return (
    <nav aria-label="Secciones" className="-mx-4 shrink-0 overflow-x-auto px-4 pt-2 md:mx-0 md:px-0 md:pt-4">
      <ul className="inline-flex min-w-max gap-0.5 rounded-[10px] bg-fill p-0.5">
        {items.map((item) => {
          const on = active(item.href);
          const link = (
              <Link
                href={item.href ? `${base}/${item.href}` : base}
                aria-current={on ? 'page' : undefined}
                className={`pressable flex h-8 items-center gap-1.5 rounded-[8px] px-3.5 text-[13px] whitespace-nowrap ${
                  on ? 'bg-sheet font-semibold text-ink shadow-[var(--shadow-raised)] dark:bg-fill-strong' : 'font-medium text-ink-2 hover:text-ink'
                }`}
              >
                {item.label}
                {item.count !== undefined && item.count > 0 && (
                  <span className="min-w-5 rounded-full bg-sys-red px-1.5 text-center text-[11px] leading-[18px] font-semibold text-white">{item.count}</span>
                )}
              </Link>
          );
          return item.feature ? (
            <FeatureGate key={item.href} as="li" compact feature={item.feature} mode={upsell ? 'upsell' : 'hide'}>
              {link}
            </FeatureGate>
          ) : (
            <li key={item.href}>{link}</li>
          );
        })}
      </ul>
    </nav>
  );
}

