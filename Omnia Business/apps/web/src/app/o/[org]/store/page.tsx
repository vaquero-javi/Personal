import { ChartColumn, CreditCard, ListChecks, Mail, Package, Receipt, Settings, ShoppingBag, TriangleAlert, Truck, Users, type LucideIcon } from 'lucide-react';
import { Badge, PageHeader } from '@/components/ui/layout';
import { NoAccess } from '@/components/ui/no-access';
import { StoreButton } from '@/features/store/store-button';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Store · Omnia' };

/** Icono y color de cada módulo principal (los submódulos usan el de su módulo). */
const ICON: Record<string, { Icon: LucideIcon; tile: string }> = {
  base: { Icon: Settings, tile: 'bg-sys-gray' },
  sales: { Icon: ShoppingBag, tile: 'bg-sys-pink' },
  purchasing: { Icon: Truck, tile: 'bg-sys-orange' },
  inventory: { Icon: Package, tile: 'bg-sys-yellow' },
  invoicing: { Icon: Receipt, tile: 'bg-sys-green' },
  hr: { Icon: Users, tile: 'bg-sys-indigo' },
  incidents: { Icon: TriangleAlert, tile: 'bg-sys-red' },
  tasks: { Icon: ListChecks, tile: 'bg-sys-teal' },
  messages: { Icon: Mail, tile: 'bg-sys-blue' },
  stats: { Icon: ChartColumn, tile: 'bg-sys-purple' },
};
const FALLBACK = { Icon: CreditCard, tile: 'bg-sys-gray' };

/**
 * Store de la sociedad: los módulos Pro (los que no vienen en el plan de entrada)
 * que Omnia no le oculta. Sus propietarios los compran o los desinstala; se
 * activan o se bloquean al momento. Lo del plan de entrada no aparece aquí.
 */
export default async function StorePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { has, hidden, catalog, org: membership } = await requireOrg(org);
  // Solo los propietarios de la sociedad.
  if (membership.roleKey !== 'owner') return <NoAccess module="Store" detail="Solo los propietarios de la sociedad pueden ver la Store y comprar o quitar módulos." />;

  const byCode = new Map(catalog.map((f) => [f.code, f]));
  const items = catalog
    .filter((f) => !f.isCore && !f.defaultEnabled && !hidden(f.code))
    .map((f) => {
      const parent = f.parentCode ? byCode.get(f.parentCode) : undefined;
      const root = f.code.split('.')[0]!;
      return {
        code: f.code,
        name: f.name,
        description: f.description,
        parentName: parent?.name ?? null,
        installed: has(f.code),
        // Para comprar un submódulo, su módulo tiene que estar activo.
        needs: !has(f.code) && parent && !has(parent.code) ? parent.name : null,
        ...(ICON[root] ?? FALLBACK),
      };
    });
  const installed = items.filter((i) => i.installed);
  const available = items.filter((i) => !i.installed);
  const label = membership.tradeName ?? membership.legalName;

  return (
    <>
      <PageHeader
        title="Store"
        description={`Módulos Pro para ${label}. Compra los que necesites y desinstala los que ya no uses: se activan o se bloquean al momento para toda la sociedad.`}
      />
      {items.length === 0 ? (
        <p className="py-16 text-center text-[15px] text-ink-3">No hay módulos Pro disponibles para esta sociedad.</p>
      ) : (
        <>
          <Section title="Disponibles" empty="Ya tienes instalados todos los módulos Pro." items={available} org={org} />
          <Section title="Instalados" empty="Aún no has instalado ningún módulo Pro." items={installed} org={org} />
        </>
      )}
    </>
  );
}

type Item = {
  code: string;
  name: string;
  description: string;
  parentName: string | null;
  installed: boolean;
  needs: string | null;
  Icon: LucideIcon;
  tile: string;
};

function Section({ title, empty, items, org }: { title: string; empty: string; items: Item[]; org: string }) {
  return (
    <section aria-labelledby={`store-${title}`} className="flex flex-col gap-3">
      <h3 id={`store-${title}`} className="px-1 text-[13px] font-semibold tracking-[0.01em] text-ink-3 uppercase">
        {title} · {items.length}
      </h3>
      {items.length === 0 ? (
        <p className="px-1 text-[15px] text-ink-3">{empty}</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))] md:gap-5 xl:grid-cols-[repeat(3,minmax(0,1fr))]">
          {items.map((item) => (
            <li key={item.code} className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] bg-sheet px-4 py-4 shadow-[var(--shadow-card)] md:px-5">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`flex size-11 shrink-0 items-center justify-center rounded-[11px] text-white shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.08),inset_0_1px_0_rgb(255_255_255/0.18)] ${item.tile}`}
                >
                  <item.Icon className="size-[22px]" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-[17px] leading-tight font-semibold">{item.name}</h4>
                  {item.parentName && <p className="text-[13px] text-ink-3">En {item.parentName}</p>}
                </div>
              </div>
              <p className="flex-1 text-[14px] text-ink-2">{item.description}</p>
              <div className="flex items-center justify-between gap-3">
                {item.installed ? <Badge tone="ok">Instalado</Badge> : item.needs ? <Badge tone="warning">Necesita «{item.needs}»</Badge> : <span />}
                <StoreButton org={org} code={item.code} name={item.name} installed={item.installed} disabled={item.needs !== null} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
