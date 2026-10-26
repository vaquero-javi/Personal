import type { ReactNode } from 'react';
import { LogOut, Search } from 'lucide-react';
import { DividerTabs } from '@/components/shell/divider-tabs';
import { spineClasses } from '@/components/shell/spines';
import { formatLongDate, initials } from '@/lib/format';
import { me, requireOrg } from '@/server/session';
import { signOut } from '@/server/session-actions';

/** Módulos y el permiso mínimo para ver su pestaña (la RLS decide lo demás). */
const MODULES = [
  { slug: '', label: 'Inicio', permission: null },
  { slug: 'ventas', label: 'Ventas', permission: 'sales.read' },
  { slug: 'compras', label: 'Compras', permission: 'purchasing.read' },
  { slug: 'almacen', label: 'Almacén', permission: 'inventory.read' },
  { slug: 'facturacion', label: 'Facturación', permission: 'invoicing.read' },
  { slug: 'rrhh', label: 'RRHH', permission: null },
  { slug: 'incidencias', label: 'Incidencias', permission: null },
  { slug: 'ajustes', label: 'Ajustes', permission: 'members.read' },
] as const;

export default async function OrganizationLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, can } = await requireOrg(slug);
  const user = await me();

  return (
    <main className="flex min-w-0 flex-1 flex-col px-3 pt-3 md:overflow-hidden md:px-6 md:pt-4 md:pl-[18px]">
      <header className="flex flex-wrap items-center gap-x-3.5 gap-y-2 md:h-10 md:flex-nowrap">
        <h1 className="order-1 flex min-w-0 basis-[calc(100%-6rem)] items-center gap-2 text-lg font-bold md:order-none md:basis-auto md:text-xl">
          <span className="truncate">{org.legalName}</span>
          <span aria-hidden className={`size-2.5 shrink-0 rounded-[2px] ${spineClasses[org.spineColor].dot}`} />
        </h1>
        <p className="order-3 text-ink-3 md:order-none">{formatLongDate(new Date())}</p>

        <form role="search" action={`/o/${org.slug}/buscar`} className="order-5 w-full md:order-none md:ml-auto md:w-80">
          <label className="flex h-[34px] items-center gap-2 rounded-md border border-shelf-edge bg-sheet px-3 focus-within:border-ink focus-within:ring-2 focus-within:ring-ink/15">
            <Search aria-hidden className="size-4 text-ink-3" strokeWidth={2} />
            <span className="sr-only">Buscar</span>
            <input name="q" type="search" placeholder="Buscar facturas, artículos, clientes…" className="w-full bg-transparent text-sm outline-none placeholder:text-ink-3" />
          </label>
        </form>

        {process.env.AUTH_MODE === 'dev' && (
          <span title="Entorno de desarrollo con datos ficticios" className="order-4 rounded-[3px] bg-ink px-2 py-[3px] text-[11px] font-semibold tracking-[0.06em] text-white uppercase md:order-none">
            Datos de ejemplo
          </span>
        )}
        <div className="order-2 ml-auto flex items-center gap-2 md:order-none md:ml-0">
          <span
            title={`${user.fullName ?? user.email} · ${org.roleName}`}
            className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white"
          >
            {initials(user.fullName ?? user.email)}
          </span>
          <span className="hidden max-w-36 flex-col leading-tight lg:flex">
            <span className="truncate text-sm font-semibold">{user.fullName ?? user.email}</span>
            <span className="truncate text-xs text-ink-3">{org.roleName}</span>
          </span>
          <form action={signOut}>
            <button type="submit" aria-label="Salir" title="Salir" className="flex size-[34px] items-center justify-center rounded-md text-ink-2 hover:bg-shelf hover:text-ink">
              <LogOut aria-hidden className="size-4" />
            </button>
          </form>
        </div>
      </header>

      <div className="mt-3.5">
        <DividerTabs
          orgSlug={org.slug}
          spine={org.spineColor}
          modules={MODULES.filter((m) => !m.permission || can(m.permission)).map(({ slug, label }) => ({ slug, label }))}
        />
      </div>

      <div className="flex flex-1 flex-col rounded-tr-lg border border-shelf-edge bg-sheet md:overflow-y-auto">{children}</div>
    </main>
  );
}
