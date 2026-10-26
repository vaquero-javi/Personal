'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { spineClasses, type SpineColor } from './spines';

/** Navegación de módulos como separadores de archivador; el activo lleva el color del lomo. */
export function DividerTabs({
  orgSlug,
  spine,
  modules,
}: {
  orgSlug: string;
  spine: SpineColor;
  modules: { slug: string; label: string }[];
}) {
  const pathname = usePathname();
  const current = pathname.split('/')[3] ?? '';

  return (
    <nav aria-label="Módulos" className="-mb-px overflow-x-auto">
      <ul className="flex min-w-max gap-1 pl-1">
        {modules.map((module) => {
          const active = module.slug === current;
          return (
            <li key={module.slug || 'inicio'}>
              <Link
                href={`/o/${orgSlug}${module.slug ? `/${module.slug}` : ''}`}
                aria-current={active ? 'page' : undefined}
                className={[
                  'relative flex h-9 items-center rounded-t-lg border border-b-0 px-[18px] text-sm transition-colors duration-150',
                  active
                    ? `z-10 border-shelf-edge border-t-[3px] bg-sheet font-bold text-ink ${spineClasses[spine].tabTop}`
                    : 'border-shelf-edge bg-shelf font-medium text-ink-2 hover:bg-[#dfe2e5] hover:text-ink',
                ].join(' ')}
              >
                {module.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
