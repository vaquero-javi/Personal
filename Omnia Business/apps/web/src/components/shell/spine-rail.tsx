'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { Layers, Plus } from 'lucide-react';
import { spineClasses, type ShelfOrg, type SpineColor } from './spines';

export type { ShelfOrg, SpineColor };

/**
 * La estantería: un lomo de archivador por sociedad. El lomo activo sale hacia
 * delante. Vive en el layout de /o (sin parámetro) para no desmontarse al
 * cambiar de sociedad y que la transición se vea.
 */
export function SpineRail({ organizations }: { organizations: ShelfOrg[] }) {
  const { org } = useParams<{ org?: string }>();
  const pathname = usePathname();
  // Al cambiar de sociedad se conserva el módulo abierto (/o/a/almacen → /o/b/almacen),
  // no el documento (su id no existe en la otra sociedad).
  const module = pathname.split('/')[3] ?? '';

  return (
    <nav
      aria-label="Sociedades"
      // El alto de cada lomo se reparte entre las sociedades (mín. 160px); con
      // muchas, la estantería se desplaza en lugar de recortar archivadores.
      style={{ '--spines': Math.max(1, organizations.length) } as CSSProperties}
      className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-shelf-edge bg-shelf px-3 pt-2 md:h-dvh md:w-[132px] md:flex-col md:gap-2.5 md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:px-0 md:pt-4 md:pb-4 md:pl-3.5"
    >
      <Link href="/" className="mr-2 self-center text-base font-bold tracking-[0.02em] md:mr-0 md:mb-1.5 md:ml-1 md:self-start">
        Omnia
      </Link>

      {organizations.length > 1 && (
        <Link
          href="/o/grupo"
          aria-current={pathname === '/o/grupo' ? 'page' : undefined}
          className="flex h-11 shrink-0 items-center gap-1.5 self-center rounded px-2 text-xs font-semibold text-ink-2 hover:bg-[#c9cdd2] hover:text-ink aria-[current]:bg-ink aria-[current]:text-white md:-ml-1 md:h-8 md:w-[104px] md:self-start"
        >
          <Layers aria-hidden className="size-4" />
          Grupo
        </Link>
      )}

      {organizations.map((organization) => {
        const active = organization.slug === org;
        return (
          <Link
            key={organization.id}
            href={`/o/${organization.slug}${module ? `/${module}` : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={organization.legalName}
            title={organization.legalName}
            className={[
              'group relative flex shrink-0 justify-center rounded-t-[4px] rounded-b-[2px] transition-[transform,width,box-shadow] duration-200 ease-out-expo',
              'shadow-[inset_-6px_0_0_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.2)]',
              // Móvil: lomos tumbados en una balda horizontal.
              'h-11 min-w-24 flex-1 items-center px-1.5 md:min-w-0 md:flex-none',
              // Escritorio: lomos de pie.
              'md:w-16 md:items-start md:px-0 md:pt-4',
              spineClasses[organization.spine].bg,
              active
                ? 'translate-y-0 md:h-[clamp(236px,calc((100dvh-6rem)/var(--spines)+2rem),262px)] md:w-[104px] md:-translate-x-1.5 md:translate-y-0 md:shadow-[inset_-8px_0_0_rgba(0,0,0,0.14),4px_3px_10px_rgba(0,0,0,0.25)]'
                : 'translate-y-1.5 hover:translate-y-0.5 md:h-[clamp(160px,calc((100dvh-6rem)/var(--spines)-1.5rem),262px)] md:translate-y-0 md:hover:translate-x-1',
            ].join(' ')}
          >
            <span
              className={[
                'block overflow-hidden border border-black/15 bg-white px-1.5 text-center leading-[26px] font-semibold tracking-[0.04em] whitespace-nowrap text-ink uppercase',
                'h-7 w-full truncate text-[11px] md:w-auto',
                // Bloque (no flex) para que text-ellipsis funcione en vertical si el lomo es bajo.
                'md:h-[calc(100%-3.75rem)] md:rotate-180 md:px-0 md:text-ellipsis md:[writing-mode:vertical-rl]',
                // Cuerpo fijo de 11px: si un lomo bajo no da para el nombre, puntos
                // suspensivos (nombre completo en title). El activo mide al menos 236px
                // para que el suyo quepa siempre entero.
                'md:text-[11px]',
                active ? 'md:w-14 md:leading-[54px]' : 'md:w-10 md:leading-[38px]',
              ].join(' ')}
            >
              {organization.label}
            </span>
            <span
              aria-hidden
              className="absolute bottom-3.5 left-1/2 hidden size-[26px] -translate-x-1/2 rounded-full bg-ink/55 shadow-[inset_0_0_0_4px_rgba(255,255,255,0.35)] md:block"
            />
          </Link>
        );
      })}

      <Link
        href="/o/nueva"
        aria-label="Nueva sociedad"
        title="Nueva sociedad"
        className="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded border-[1.5px] border-dashed border-[#8a9097] text-ink-2 hover:border-ink hover:text-ink md:mt-1 md:h-10 md:w-16 md:self-start"
      >
        <Plus aria-hidden className="size-5" />
      </Link>
    </nav>
  );
}
