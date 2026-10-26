import { Cell, PageHeader } from '@/components/ui/layout';
import { InvoiceForm } from '@/features/invoicing/invoice-form';
import { container } from '@/server/container';
import { requirePermission } from '@/server/session';
import { createInvoice } from '../../../facturacion/actions';

export const metadata = { title: 'Registrar factura recibida · Omnia' };

export default async function NewReceivedInvoicePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requirePermission(org, 'invoicing.write');
  const [suppliers, items] = await Promise.all([container().parties.list(ctx, { role: 'supplier' }), container().warehouse.items(ctx)]);
  return (
    <>
      <PageHeader title="Registrar factura de proveedor" back={{ href: `/o/${org}/compras/facturas`, label: 'Facturas recibidas' }} />
      <Cell>
        <InvoiceForm
          action={createInvoice.bind(null, org, 'received')}
          direction="received"
          parties={suppliers.map((s) => ({ value: s.id, label: s.legalName }))}
          items={items.filter((i) => i.isActive).map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unitOfMeasure, suggested: Number(i.avgUnitCost) ? Number(i.avgUnitCost).toString() : '', taxRate: i.defaultTaxRate }))}
        />
      </Cell>
    </>
  );
}
