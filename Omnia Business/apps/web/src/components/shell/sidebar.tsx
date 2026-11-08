'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useRef, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import {
  ChartColumn,
  House,
  Layers,
  ListChecks,
  LogOut,
  Package,
  PanelLeft,
  Plus,
  Receipt,
  Search,
  Settings,
  ShoppingBag,
  TriangleAlert,
  Truck,
  Users,
  type LucideProps,
} from 'lucide-react';
import { MODULES, moduleLabel } from './modules';
import { spineCss, type SpineColor } from './spines';

export interface SidebarOrg {
  id: string;
  slug: string;
  legalName: string;
  label: string;
  spine: SpineColor;
  roleName: string;
  /** Módulos visibles con los permisos del usuario en esta sociedad. */
  modules: string[];
}

export interface SidebarUser {
  name: string;
}

/** Icono y color de cada módulo, al estilo de Ajustes: glifo blanco sobre baldosa de color. */
const MODULE_ICON: Record<string, { Icon: ComponentType<LucideProps>; tile: string }> = {
  '': { Icon: House, tile: 'bg-sys-blue' },
  ventas: { Icon: ShoppingBag, tile: 'bg-sys-pink' },
  compras: { Icon: Truck, tile: 'bg-sys-orange' },
  almacen: { Icon: Package, tile: 'bg-sys-yellow' },
  facturacion: { Icon: Receipt, tile: 'bg-sys-green' },
  rrhh: { Icon: Users, tile: 'bg-sys-indigo' },
  incidencias: { Icon: TriangleAlert, tile: 'bg-sys-red' },
  tareas: { Icon: ListChecks, tile: 'bg-sys-teal' },
  estadisticas: { Icon: ChartColumn, tile: 'bg-sys-purple' },
  ajustes: { Icon: Settings, tile: 'bg-sys-gray' },
};

const firstLetter = (s: string) => (s.trim()[0] ?? '?').toUpperCase();

function Tile({ className = '', style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <span
      aria-hidden
      style={style}
      className={`flex size-[26px] shrink-0 items-center justify-center rounded-[7px] text-white shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.08),inset_0_1px_0_rgb(255_255_255/0.18)] ${className}`}
    >
      {children}
    </span>
  );
}

function Row({
  href,
  active,
  quiet = false,
  children,
  label,
}: {
  href: string;
  active: boolean;
  /** Selección gris (la sociedad abierta) en lugar de la de acento (el módulo abierto). */
  quiet?: boolean;
  children: ReactNode;
  label?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? (quiet ? 'true' : 'page') : undefined}
      aria-label={label}
      title={label}
      className={[
        'pressable flex h-9 items-center gap-2.5 rounded-[9px] px-2 text-[14px] font-medium',
        active && !quiet ? 'bg-tint text-on-tint' : active ? 'bg-fill-strong text-ink' : 'text-ink hover:bg-fill active:bg-fill-strong',
      ].join(' ')}
    >
      {children}
    </Link>
  );
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-5 mb-1 flex h-6 items-center px-2">
      <h2 className="text-[12px] font-semibold tracking-normal text-ink-3">{children}</h2>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

/** Contenido de la barra lateral (compartido por escritorio y la hoja de móvil). */
function SidebarContent({
  organizations,
  user,
  devMode,
  signOut,
}: {
  organizations: SidebarOrg[];
  user: SidebarUser;
  devMode: boolean;
  signOut: () => Promise<void>;
}) {
  const { org: slug } = useParams<{ org?: string }>();
  const pathname = usePathname();
  // Al cambiar de sociedad se conserva el módulo abierto (/o/a/almacen → /o/b/almacen),
  // no el documento (su id no existe en la otra sociedad).
  const current = pathname.split('/')[3] ?? '';
  const active = organizations.find((o) => o.slug === slug);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <Link href="/" aria-label="Omnia, inicio" className="flex items-center gap-2 rounded-lg">
          {/* Anillos del logo (public/brand/logo.png, 256×256 con fondo blanco), recortados:
              el blanco desaparece con multiply y en oscuro se invierte y se funde con screen. */}
          <span aria-hidden className="relative block h-[26px] w-[39px] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo.png"
              alt=""
              width={53}
              height={53}
              className="absolute top-[-13.4px] left-[-7px] size-[53px] max-w-none mix-blend-multiply dark:mix-blend-screen dark:invert"
            />
          </span>
          <span className="font-display text-[19px] font-bold tracking-[-0.015em]">Omnia</span>
        </Link>
        {devMode && (
          <span title="Entorno de desarrollo con datos ficticios" className="ml-auto rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
            Ejemplo
          </span>
        )}
      </div>

      {active && (
        <form role="search" action={`/o/${active.slug}/buscar`} className="px-3 pb-1">
          <label className="flex h-8 items-center gap-1.5 rounded-[9px] bg-fill px-2.5 focus-within:ring-[3px] focus-within:ring-tint/40">
            <Search aria-hidden className="size-[15px] text-ink-3" strokeWidth={2.2} />
            <span className="sr-only">Buscar</span>
            <input name="q" type="search" placeholder="Buscar" className="w-full bg-transparent text-[14px] outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden" />
          </label>
        </form>
      )}

      <nav aria-label="Navegación" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {active && (
          <>
            <SectionTitle>{active.label}</SectionTitle>
            <ul className="flex flex-col gap-px">
              {MODULES.filter((m) => active.modules.includes(m.slug)).map((m) => {
                const { Icon, tile } = MODULE_ICON[m.slug]!;
                const on = m.slug === current;
                return (
                  <li key={m.slug || 'inicio'}>
                    <Row href={`/o/${active.slug}${m.slug ? `/${m.slug}` : ''}`} active={on}>
                      <Tile className={tile}>
                        <Icon className="size-[15px]" strokeWidth={2.2} />
                      </Tile>
                      {m.label}
                    </Row>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <SectionTitle
          action={
            <Link
              href="/o/nueva"
              aria-label="Nueva sociedad"
              title="Nueva sociedad"
              className="pressable flex size-6 items-center justify-center rounded-[10px] text-ink-3 hover:bg-fill hover:text-ink"
            >
              <Plus aria-hidden className="size-4" strokeWidth={2.2} />
            </Link>
          }
        >
          Sociedades
        </SectionTitle>
        <ul className="flex flex-col gap-px">
          {organizations.length > 1 && (
            <li>
              <Row href="/o/grupo" active={pathname === '/o/grupo'}>
                <Tile className="bg-gradient-to-b from-[#8e8e93] to-[#636366]">
                  <Layers className="size-[15px]" strokeWidth={2.2} />
                </Tile>
                Vista de grupo
              </Row>
            </li>
          )}
          {organizations.map((o) => {
            const on = o.slug === slug;
            return (
              <li key={o.id}>
                <Row href={`/o/${o.slug}${current ? `/${current}` : ''}`} active={on} quiet label={o.legalName}>
                  <span
                    aria-hidden
                    className="flex size-[26px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.1)]"
                    style={{ backgroundColor: spineCss(o.spine) }}
                  >
                    {firstLetter(o.label)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                </Row>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex items-center gap-2.5 border-t border-line-soft px-4 py-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#a1a1a6] to-[#6e6e73] text-[13px] font-semibold text-white"
        >
          {user.name
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase())
            .join('')}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13px] font-semibold">{user.name}</span>
          {active && <span className="truncate text-[12px] text-ink-3">{active.roleName}</span>}
        </span>
        <form action={signOut}>
          <button type="submit" aria-label="Salir" title="Salir" className="pressable flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-fill hover:text-ink">
            <LogOut aria-hidden className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Barra lateral de app de Apple: material translúcido, módulos con baldosas de
 * color al estilo de Ajustes y las sociedades debajo. En móvil se pliega en una
 * barra superior y se abre como hoja desde la izquierda.
 */
export function Sidebar(props: { organizations: SidebarOrg[]; user: SidebarUser; devMode: boolean; signOut: () => Promise<void> }) {
  const { org: slug } = useParams<{ org?: string }>();
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const active = props.organizations.find((o) => o.slug === slug);
  const title = pathname === '/o/grupo' ? 'Vista de grupo' : pathname === '/o/nueva' ? 'Nueva sociedad' : (moduleLabel(pathname.split('/')[3] ?? '') ?? 'Omnia');

  // Al navegar, la hoja se cierra.
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  return (
    <>
      <aside className="material sticky top-0 hidden h-dvh w-[264px] shrink-0 border-r border-line-soft md:block">
        <SidebarContent {...props} />
      </aside>

      {/* Móvil: barra de navegación translúcida. */}
      <header className="material-bar sticky top-0 z-30 flex h-[52px] items-center gap-2 border-b border-line-soft px-2 pt-[env(safe-area-inset-top)] md:hidden">
        <button
          type="button"
          onClick={() => dialog.current?.showModal()}
          aria-label="Abrir barra lateral"
          className="pressable flex size-10 items-center justify-center rounded-full text-tint active:bg-fill"
        >
          <PanelLeft aria-hidden className="size-[22px]" strokeWidth={2} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center pr-12 leading-tight">
          <span className="truncate text-[16px] font-semibold">{title}</span>
          {active && <span className="truncate text-[12px] text-ink-3">{active.label}</span>}
        </div>
      </header>

      <dialog
        ref={dialog}
        aria-label="Barra lateral"
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="m-0 h-dvh max-h-none w-[min(320px,86vw)] max-w-none bg-transparent p-0 text-ink backdrop:bg-black/30 open:animate-[sheet-in-left_320ms_var(--ease-spring)] open:backdrop:animate-[scrim-in_250ms_ease] md:hidden"
      >
        <div className="h-full bg-sheet pt-[env(safe-area-inset-top)] shadow-[var(--shadow-float)]">
          <SidebarContent {...props} />
        </div>
      </dialog>
    </>
  );
}
