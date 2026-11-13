'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import {
  ChartColumn,
  ChevronRight,
  House,
  Landmark,
  Layers,
  ListChecks,
  LogOut,
  Mail,
  Package,
  PanelLeft,
  Plus,
  Receipt,
  Search,
  Settings,
  Store,
  ShoppingBag,
  TriangleAlert,
  Truck,
  Users,
  type LucideProps,
} from 'lucide-react';
import { FeatureGate } from '@/components/entitlements/feature-gate';
import { MODULES, moduleLabel } from './modules';
import { ThemePicker } from './theme-picker';
import { spineCss, type SpineColor } from './spines';

export interface SidebarOrg {
  id: string;
  slug: string;
  legalName: string;
  label: string;
  spine: SpineColor;
  roleName: string;
  /** Módulos que el ROL del usuario permite en esta sociedad (lo contratado se decide con FeatureGate). */
  modules: string[];
  /** Gestiona la sociedad: ve los módulos no contratados con candado para pedirlos. */
  canManage: boolean;
  kind: 'holding' | 'company';
  /** Holding del que cuelga (si el usuario también es miembro de él). */
  parentId: string | null;
  /** Empresas (negocios o locales) activas de la sociedad. */
  establishments: { id: string; name: string }[];
  /** La elegida para filtrar la app en esta sociedad (null = todas). */
  activeEstablishmentId: string | null;
  /** Conversaciones sin leer en Mensajes. */
  unreadMessages: number;
}

/** Holdings con sus sociedades dentro; luego las sociedades sueltas (o cuyo holding no ves). */
function orgGroups(organizations: SidebarOrg[]): { org: SidebarOrg; children: SidebarOrg[] }[] {
  const ids = new Set(organizations.map((o) => o.id));
  const out = organizations.filter((o) => o.kind === 'holding').map((h) => ({ org: h, children: organizations.filter((o) => o.parentId === h.id) }));
  for (const o of organizations) if (o.kind !== 'holding' && !(o.parentId && ids.has(o.parentId))) out.push({ org: o, children: [] });
  return out;
}

const COLLAPSED_KEY = 'omnia-sidebar-collapsed';

/**
 * Holdings recogidos en la barra lateral. Es una preferencia de este navegador
 * (localStorage): no se guarda en la cuenta. Se lee tras montar para no
 * descuadrar el HTML del servidor; si falla el almacenamiento, todo desplegado.
 */
function useCollapsedHoldings(): [ReadonlySet<string>, (id: string) => void] {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      if (raw) setCollapsed(new Set((JSON.parse(raw) as unknown[]).filter((v): v is string => typeof v === 'string')));
    } catch {
      /* sin almacenamiento: desplegado */
    }
  }, []);
  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        /* se pierde al recargar; no importa */
      }
      return next;
    });
  }, []);
  return [collapsed, toggle];
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
  mensajes: { Icon: Mail, tile: 'bg-sys-blue' },
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
  className = '',
  plain = false,
}: {
  /** Enlace normal, sin precarga: para enlaces que cambian algo (p. ej. elegir empresa). */
  plain?: boolean;
  href: string;
  active: boolean;
  /** Selección gris (la sociedad abierta) en lugar de la de acento (el módulo abierto). */
  quiet?: boolean;
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const Anchor = plain ? 'a' : Link;
  return (
    <Anchor
      href={href}
      aria-current={active ? (quiet ? 'true' : 'page') : undefined}
      aria-label={label}
      title={label}
      className={[
        'pressable flex h-9 items-center gap-2.5 rounded-[9px] px-2 text-[14px] font-medium',
        active && !quiet ? 'bg-tint text-on-tint' : active ? 'bg-fill-strong text-ink' : 'text-ink hover:bg-fill active:bg-fill-strong',
        className,
      ].join(' ')}
    >
      {children}
    </Anchor>
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

/** Fila de una sociedad u holding. */
function OrgRow({
  o,
  slug,
  current,
  toggleable,
  badge,
  containsOpen = false,
}: {
  o: SidebarOrg;
  slug: string | undefined;
  current: string;
  toggleable: boolean;
  badge: number | null;
  /** Recogida y con lo abierto dentro: se marca para no perder dónde estás. */
  containsOpen?: boolean;
}) {
  const holding = o.kind === 'holding';
  // Con una empresa elegida (y visible), la sociedad abierta queda en gris claro: la marca la lleva la empresa.
  const on = (o.slug === slug && !o.activeEstablishmentId) || containsOpen;
  return (
    <Row
      href={`/o/${o.slug}${current ? `/${current}` : ''}`}
      active={on}
      quiet
      label={holding ? `${o.legalName} (holding)` : o.legalName}
      className={`${toggleable ? 'pr-9' : ''} ${o.slug === slug && !on ? 'bg-fill' : ''}`}
    >
      <span
        aria-hidden
        className={`flex size-[26px] shrink-0 items-center justify-center text-[12px] font-semibold text-white shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.1)] ${holding ? 'rounded-[7px]' : 'rounded-full'}`}
        style={{ backgroundColor: spineCss(o.spine) }}
      >
        {holding ? <Landmark className="size-[14px]" strokeWidth={2.2} /> : firstLetter(o.label)}
      </span>
      <span className="min-w-0 flex-1 truncate">{o.label}</span>
      {badge !== null ? (
        <span className="shrink-0 rounded-full bg-fill-strong px-1.5 text-[11px] leading-[18px] font-semibold text-ink-2">{badge}</span>
      ) : (
        holding && <span className="shrink-0 text-[11px] font-medium text-ink-3">Holding</span>
      )}
    </Row>
  );
}

function Disclosure({ id, label, isCollapsed, count, toggle }: { id: string; label: string; isCollapsed: boolean; count: number; toggle: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => toggle(id)}
      aria-expanded={!isCollapsed}
      aria-controls={`tree-${id}`}
      aria-label={`${isCollapsed ? 'Desplegar' : 'Recoger'} ${label}`}
      title={isCollapsed ? `Desplegar (${count})` : 'Recoger'}
      className="pressable absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-[7px] text-ink-3 hover:bg-fill-strong hover:text-ink"
    >
      <ChevronRight aria-hidden className={`size-4 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`} strokeWidth={2.4} />
    </button>
  );
}

/** Rama con sangría y filete a la izquierda (la de un holding o la de una sociedad). */
function Branch({ id, children }: { id: string; children: ReactNode }) {
  return (
    <ul id={`tree-${id}`} className="mt-px ml-[21px] flex flex-col gap-px border-l border-line-soft pl-1.5">
      {children}
    </ul>
  );
}

/** Empresas (locales) de una sociedad: pulsar una abre la sociedad filtrada por ella. */
function EstablishmentRows({ o, slug, current }: { o: SidebarOrg; slug: string | undefined; current: string }) {
  return o.establishments.map((e) => {
    const on = o.slug === slug && o.activeEstablishmentId === e.id;
    return (
      <li key={e.id}>
        <Row plain href={`/o/${o.slug}/empresa/${on ? 'todas' : e.id}${current ? `?ir=${current}` : ''}`} active={on} quiet label={on ? `${e.name}: quitar el filtro de empresa` : `${e.name} (${o.label})`}>
          <span aria-hidden className="flex size-[22px] shrink-0 items-center justify-center rounded-[6px] bg-fill text-ink-2">
            <Store className="size-[13px]" strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px]">{e.name}</span>
        </Row>
      </li>
    );
  });
}

/**
 * Nodo del árbol: holding → sociedades → empresas. Cada nivel con hijos se
 * puede recoger; recogido, se esconde todo lo de dentro.
 */
function OrgNode({
  org: o,
  childOrgs,
  slug,
  current,
  collapsed,
  toggle,
}: {
  org: SidebarOrg;
  childOrgs: SidebarOrg[];
  slug: string | undefined;
  current: string;
  collapsed: ReadonlySet<string>;
  toggle: (id: string) => void;
}) {
  const holding = o.kind === 'holding';
  const count = holding ? childOrgs.length : o.establishments.length;
  if (count === 0) {
    return (
      <li>
        <OrgRow o={o} slug={slug} current={current} toggleable={false} badge={null} />
      </li>
    );
  }
  const isCollapsed = collapsed.has(o.id);
  const label = holding ? `las sociedades de ${o.label}` : `las empresas de ${o.label}`;

  // Recogido: se esconde todo lo de dentro. Si lo abierto está dentro, la fila se marca.
  const containsOpen = isCollapsed && (holding ? childOrgs.some((c) => c.slug === slug) : o.slug === slug && !!o.activeEstablishmentId);
  return (
    <li>
      <div className="relative">
        <OrgRow o={o} slug={slug} current={current} toggleable badge={isCollapsed ? count : null} containsOpen={containsOpen} />
        <Disclosure id={o.id} label={label} isCollapsed={isCollapsed} count={count} toggle={toggle} />
      </div>
      {!isCollapsed && (
        <Branch id={o.id}>
          {holding ? (
            childOrgs.map((c) => <OrgNode key={c.id} org={c} childOrgs={[]} slug={slug} current={current} collapsed={collapsed} toggle={toggle} />)
          ) : (
            <EstablishmentRows o={o} slug={slug} current={current} />
          )}
        </Branch>
      )}
    </li>
  );
}

/** Contenido de la barra lateral (compartido por escritorio y la hoja de móvil). */
function SidebarContent({
  organizations,
  user,
  devMode,
  signOut,
  collapsed,
  toggleHolding,
}: {
  organizations: SidebarOrg[];
  user: SidebarUser;
  devMode: boolean;
  signOut: () => Promise<void>;
  collapsed: ReadonlySet<string>;
  toggleHolding: (id: string) => void;
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
        <Link href="/app" aria-label="Omnia, inicio" className="flex items-center gap-2 rounded-lg">
          {/* Anillos del logo (public/brand/logo.png) en vectorial: nítidos y del color del texto en claro y oscuro. */}
          <svg aria-hidden viewBox="34 65 187 126" className="h-[26px] w-auto text-ink" fill="none" stroke="currentColor" strokeWidth={12}>
            <circle cx={97} cy={128} r={57} />
            <circle cx={158} cy={128} r={57} />
          </svg>
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
                const row = (
                  <Row href={`/o/${active.slug}${m.slug ? `/${m.slug}` : ''}`} active={on}>
                    <Tile className={tile}>
                      <Icon className="size-[15px]" strokeWidth={2.2} />
                    </Tile>
                    <span className="min-w-0 flex-1 truncate">{m.label}</span>
                    {m.slug === 'mensajes' && active.unreadMessages > 0 && (
                      <span
                        aria-label={`${active.unreadMessages} sin leer`}
                        className={`min-w-5 shrink-0 rounded-full px-1.5 text-center text-[11px] leading-[18px] font-semibold ${on ? 'bg-on-tint text-tint' : 'bg-sys-red text-white'}`}
                      >
                        {active.unreadMessages}
                      </span>
                    )}
                  </Row>
                );
                return m.feature ? (
                  <FeatureGate key={m.slug} as="li" feature={m.feature} mode={active.canManage ? 'upsell' : 'hide'}>
                    {row}
                  </FeatureGate>
                ) : (
                  <li key={m.slug || 'inicio'}>{row}</li>
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
          {orgGroups(organizations).map(({ org: h, children }) => (
            <OrgNode key={h.id} org={h} childOrgs={children} slug={slug} current={current} collapsed={collapsed} toggle={toggleHolding} />
          ))}
        </ul>
      </nav>

      <div className="border-t border-line-soft px-3 pt-3">
        <ThemePicker />
      </div>
      <div className="flex items-center gap-2.5 px-4 py-3">
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
  // Un solo estado para la barra de escritorio y la hoja del móvil.
  const [collapsed, toggleHolding] = useCollapsedHoldings();
  const active = props.organizations.find((o) => o.slug === slug);
  const title = pathname === '/o/grupo' ? 'Vista de grupo' : pathname === '/o/nueva' ? 'Nueva sociedad' : (moduleLabel(pathname.split('/')[3] ?? '') ?? 'Omnia');

  // Al navegar, la hoja se cierra.
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  return (
    <>
      <aside className="material sticky top-0 hidden h-dvh w-[264px] shrink-0 border-r border-line-soft md:block">
        <SidebarContent {...props} collapsed={collapsed} toggleHolding={toggleHolding} />
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
          <SidebarContent {...props} collapsed={collapsed} toggleHolding={toggleHolding} />
        </div>
      </dialog>
    </>
  );
}
