import { Cell, PageHeader } from '@/components/ui/layout';
import { ReceivedInvoiceEntry } from '@/features/purchasing/received-invoice-entry';
import { SCAN_ACCEPT, scanConfigured } from '@/server/delivery-note-reader';
import { container } from '@/server/container';
import { requirePermission } from '@/server/session';
import { createInvoice } from '../../../facturacion/actions';
import { scanReceivedInvoice } from '../../actions';

export const metadata = { title: 'Registrar factura recibida · Omnia' };

export default async function NewReceivedInvoicePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requirePermission(org, 'invoicing.write');
  const [suppliers, items] = await Promise.all([container().parties.list(ctx, { role: 'supplier' }), container().warehouse.items(ctx)]);
  return (
    <>
      <PageHeader
        title="Registrar factura de proveedor"
        description="Escríbela a mano, o haz una foto o sube el archivo (PDF) que te mandó el proveedor y se rellena sola."
        back={{ href: `/o/${org}/compras/facturas`, label: 'Facturas recibidas' }}
      />
      <Cell>
        <ReceivedInvoiceEntry
          action={createInvoice.bind(null, org, 'received')}
          scan={scanReceivedInvoice.bind(null, org)}
          scanReady={scanConfigured()}
          accept={SCAN_ACCEPT}
          suppliers={suppliers.map((s) => ({ value: s.id, label: s.legalName }))}
          items={items.filter((i) => i.isActive).map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unitOfMeasure, suggested: Number(i.avgUnitCost) ? Number(i.avgUnitCost).toString() : '', taxRate: i.defaultTaxRate }))}
        />
      </Cell>
    </>
  );
}
