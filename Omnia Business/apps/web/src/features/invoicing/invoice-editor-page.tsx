import { notFound } from 'next/navigation';
import type { InvoiceDetail } from '@omnia/invoicing/types';
import { PageHeader } from '@/components/ui/layout';
import { container } from '@/server/container';
import { requirePermission } from '@/server/session';
import { todayIso } from '@/lib/format';
import { saveInvoice } from '@/app/o/[org]/facturacion/actions';
import { InvoiceEditor, type EditorInitial } from './invoice-editor';

const asInput = (n: string) => Number(n).toString().replace('.', ',');

function toInitial(inv: InvoiceDetail, copy: boolean): EditorInitial {
  return {
    // Al duplicar una rectificativa sale una factura normal.
    invoiceType: copy && inv.invoiceType.startsWith('R') ? 'F1' : inv.invoiceType,
    partyId: inv.partyId ?? '',
    operationDate: copy ? '' : (inv.operationDate ?? ''),
    dueDate: copy ? '' : (inv.dueDate ?? ''),
    paymentMethod: inv.paymentMethod ?? 'transfer',
    withholdingRate: Number(inv.withholdingRate).toString(),
    notes: inv.notes ?? '',
    lines: inv.lines.map((l) => ({
      itemId: l.itemId ?? '',
      description: l.description,
      quantity: asInput(l.quantity),
      unit: asInput(l.unitPrice),
      discountPct: asInput(l.discountPct),
      taxRate: asInput(l.taxRate),
    })),
  };
}

/**
 * Carga lo que necesita el editor: clientes, artículos con su precio de
 * tarifa, series activas y, si se edita o duplica, la factura de partida.
 */
export async function InvoiceEditorPage({ org, draftId, copyFrom }: { org: string; draftId?: string; copyFrom?: string }) {
  const { ctx, can } = await requirePermission(org, 'invoicing.write');
  const svc = container();
  const [customers, items, lists, series, organization, source] = await Promise.all([
    svc.parties.list(ctx, { role: 'customer' }),
    svc.warehouse.items(ctx),
    svc.parties.priceLists(ctx),
    svc.invoicing.series(ctx),
    svc.organizations.get(ctx),
    draftId || copyFrom ? svc.invoicing.get(ctx, (draftId ?? copyFrom)!).catch(() => null) : Promise.resolve(null),
  ]);
  if ((draftId || copyFrom) && (!source || source.direction !== 'issued')) notFound();
  if (draftId && source!.status !== 'draft') notFound();

  const defaultList = lists.find((l) => l.isDefault);
  const prices = defaultList ? await svc.parties.priceFor(ctx, items.map((i) => i.id), defaultList.id) : new Map<string, string>();
  const base = `/o/${org}/facturacion`;
  const year = Number(todayIso().slice(0, 4));

  return (
    <>
      <PageHeader
        title={draftId ? 'Editar borrador' : copyFrom ? `Nueva factura a partir de ${source!.fullNumber ?? 'un borrador'}` : 'Nueva factura'}
        description="Guárdala como borrador para revisarla, o emítela ya: recibe su número correlativo y su huella VeriFactu, y desde entonces no se puede modificar."
        back={draftId ? { href: `${base}/${draftId}`, label: 'Volver al borrador' } : { href: base, label: 'Facturas emitidas' }}
      />
      <InvoiceEditor
        action={saveInvoice.bind(null, org, draftId ?? null)}
        editing={!!draftId}
        issuer={{ legalName: organization.legalName, tradeName: organization.tradeName, taxId: organization.taxId, verifactu: organization.fiscalRegime === 'verifactu' }}
        customers={customers.map((c) => ({
          id: c.id,
          legalName: c.legalName,
          taxId: c.taxId,
          termsDays: c.paymentTermsDays,
          address: [c.billingAddress.line, [c.billingAddress.postalCode, c.billingAddress.city].filter(Boolean).join(' '), c.billingAddress.province].filter(Boolean).join(', ') || null,
        }))}
        items={items
          .filter((i) => i.isActive)
          .map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unitOfMeasure, suggested: prices.get(i.id) ? Number(prices.get(i.id)).toString().replace('.', ',') : '', taxRate: Number(i.defaultTaxRate).toString() }))}
        series={series
          .filter((s) => s.isActive && s.fiscalYear >= year)
          .map((s) => ({ id: s.id, code: s.code, fiscalYear: s.fiscalYear, kind: s.invoiceKind, nextNumber: s.nextNumber }))}
        canIssue={can('invoicing.issue')}
        today={todayIso()}
        {...(source ? { initial: toInitial(source, !draftId) } : {})}
        seriesHref={`${base}/series`}
        newCustomerHref={`/o/${org}/ventas/clientes/nuevo`}
      />
    </>
  );
}
