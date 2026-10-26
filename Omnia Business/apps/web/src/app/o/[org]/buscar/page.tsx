import Link from 'next/link';
import { Cell, EmptyState, PageHeader } from '@/components/ui/layout';
import { formatEuro } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Buscar · Omnia' };

export default async function SearchPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ q?: string }> }) {
  const { org } = await params;
  const { q = '' } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  const term = q.trim();
  const [items, parties, invoices, incidents] = term
    ? await Promise.all([
        can('inventory.read') ? container().warehouse.items(ctx, { search: term }) : [],
        can('parties.read') ? container().parties.list(ctx, { search: term }) : [],
        can('invoicing.read') ? container().invoicing.list(ctx, { search: term }) : [],
        container().incidents.list(ctx, { status: 'all', search: term }),
      ])
    : [[], [], [], []];
  const base = `/o/${org}`;
  const groups = [
    { title: 'Artículos', rows: items.slice(0, 8).map((i) => ({ href: `${base}/almacen/articulos/${i.id}`, label: i.name, meta: i.sku })) },
    { title: 'Clientes y proveedores', rows: parties.slice(0, 8).map((p) => ({ href: `${base}/${p.isCustomer ? 'ventas/clientes' : 'compras/proveedores'}/${p.id}`, label: p.legalName, meta: p.taxId ?? '' })) },
    { title: 'Facturas', rows: invoices.slice(0, 8).map((i) => ({ href: `${base}/facturacion/${i.id}`, label: i.fullNumber ?? 'Borrador', meta: `${i.partyName ?? ''} · ${formatEuro(i.total)}` })) },
    { title: 'Incidencias', rows: incidents.slice(0, 8).map((i) => ({ href: `${base}/incidencias/${i.id}`, label: `#${i.number} ${i.title}`, meta: i.category ?? '' })) },
  ].filter((g) => g.rows.length > 0);
  return (
    <>
      <PageHeader title={term ? `Resultados para «${term}»` : 'Buscar'} />
      <Cell>
        {groups.length === 0 ? (
          <EmptyState title={term ? 'Sin resultados' : 'Escribe en el buscador de arriba'}>Busca artículos, clientes, proveedores, facturas e incidencias de esta sociedad.</EmptyState>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {groups.map((g) => (
              <section key={g.title}>
                <h3 className="mb-2 text-sm font-bold">{g.title}</h3>
                <ul className="divide-y divide-line-soft text-sm">
                  {g.rows.map((r) => (
                    <li key={r.href} className="flex justify-between gap-3 py-2">
                      <Link href={r.href} className="min-w-0 truncate font-medium underline-offset-2 hover:underline">{r.label}</Link>
                      <span className="shrink-0 text-ink-3">{r.meta}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Cell>
    </>
  );
}
