import Link from 'next/link';
import { Cell, EmptyState, PageHeader } from '@/components/ui/layout';
import { NoAccess } from '@/components/ui/no-access';
import { Notice, inputClass } from '@/components/ui/form';
import { buttonClass } from '@/components/ui/button-styles';
import { ComparisonSummary, ComparisonTable, MissingItems, sortRows } from '@/features/purchasing/price-comparison-table';
import { formatDate } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Comparador de precios · Omnia' };

export default async function PriceComparatorPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ proveedor?: string }> }) {
  const { org } = await params;
  const { proveedor } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  if (!can('invoicing.read')) return <NoAccess module="Facturas recibidas" />;
  const suppliers = await container().purchasing.suppliersWithInvoices(ctx);
  const selected = suppliers.find((s) => s.id === proveedor);
  const result = selected ? await container().purchasing.compareLatestInvoices(ctx, selected.id) : null;
  const invoiceHref = (id: string) => `/o/${org}/compras/facturas/${id}`;
  const comparison = result?.comparison;

  return (
    <>
      <PageHeader title="Comparador de precios" description="Elige un proveedor y compara, artículo a artículo, el precio por unidad de su última factura con el de la penúltima." />
      <Cell>
        {suppliers.length === 0 ? (
          <EmptyState title="Aún no hay facturas recibidas">Registra las facturas de tus proveedores en «Facturas recibidas» y aquí podrás comparar sus precios.</EmptyState>
        ) : (
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-72 flex-col gap-1 text-sm">
              <span className="font-medium text-ink-2">Proveedor</span>
              <select name="proveedor" defaultValue={selected?.id ?? ''} required className={inputClass}>
                <option value="" disabled>
                  Elige un proveedor…
                </option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.legalName} ({s.invoiceCount} {s.invoiceCount === 1 ? 'factura' : 'facturas'})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={buttonClass('primary')}>
              Comparar
            </button>
          </form>
        )}

        {selected && result && !comparison && (
          <div className="mt-5">
            <Notice tone="warning">
              {selected.legalName} solo tiene una factura registrada
              {result.latest ? (
                <>
                  {' '}(<Link href={invoiceHref(result.latest.id)} className="underline underline-offset-2">{result.latest.fullNumber}</Link>)
                </>
              ) : null}
              . Registra la siguiente en «Facturas recibidas» para poder comparar precios.
            </Notice>
          </div>
        )}

        {selected && result?.latest && comparison?.previous && (
          <div className="mt-6 flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Penúltima factura', comparison.previous] as const,
                ['Última factura', result.latest] as const,
              ].map(([label, inv]) => (
                <Link key={inv.id} href={invoiceHref(inv.id)} className="pressable rounded-xl border border-line-soft px-4 py-3 hover:bg-fill/60">
                  <span className="block text-xs text-ink-3">{label}</span>
                  <span className="block font-semibold">{inv.fullNumber}</span>
                  <span className="block text-sm text-ink-2">{formatDate(inv.issueDate)}</span>
                </Link>
              ))}
            </div>
            <p className="text-sm text-ink-2">
              Se compara el precio de una unidad (con el descuento de la línea aplicado), no el importe de la línea: da igual cuántas unidades se compraran en cada factura.
            </p>
            <ComparisonSummary comparison={comparison} />
            <ComparisonTable
              rows={sortRows(comparison.rows)}
              labels={{ previous: `Precio en ${comparison.previous.fullNumber}`, current: `Precio en ${result.latest.fullNumber}` }}
            />
            <MissingItems items={comparison.missing} />
          </div>
        )}
      </Cell>
    </>
  );
}
