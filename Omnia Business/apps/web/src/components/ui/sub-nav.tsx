'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Secciones de un módulo, como índice de pestañas finas bajo los separadores. */
export function SubNav({ base, items }: { base: string; items: { href: string; label: string; count?: number }[] }) {
  const pathname = usePathname();
  const matches = (href: string) => {
    const full = href ? `${base}/${href}` : base;
    return href === '' ? pathname === base : pathname === full || pathname.startsWith(`${full}/`);
  };
  // Con secciones anidadas (nominas y nominas/personal) gana la más concreta.
  const current = items.filter((i) => matches(i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const active = (href: string) => href === current;
  return (
    <nav aria-label="Secciones" className="sticky top-0 z-20 shrink-0 overflow-x-auto border-b border-line bg-sheet">
      <ul className="flex min-w-max gap-1 px-2 md:px-3">
        {items.map((item) => {
          const on = active(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href ? `${base}/${item.href}` : base}
                aria-current={on ? 'page' : undefined}
                className={`flex h-10 items-center gap-1.5 border-b-2 px-2.5 text-sm transition-colors ${
                  on ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink'
                }`}
              >
                {item.label}
                {item.count !== undefined && item.count > 0 && (
                  <span className="rounded-full bg-carton px-1.5 text-xs font-semibold text-ink-2">{item.count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
