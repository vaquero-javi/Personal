import { Cell, PageHeader } from '@/components/ui/layout';
import { ReceivedInvoiceEntry } from '@/features/purchasing/received-invoice-entry';
import { SCAN_ACCEPT, scanConfigured } from '@/server/delivery-note-reader';
import { container } from '@/server/container';
import { requirePermission } from '@/server/session';
import { createInvoice } from '../../../facturacion/actions';
import { createItemFromScan, createSupplierFromScan, scanReceivedInvoice } from '../../actions';
import { FEATURES } from '@/server/features';

export const metadata = { title: 'Registrar factura recibida · Omnia' };

export default async function NewReceivedInvoicePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can, has } = await requirePermission(org, 'invoicing.write');
  const [suppliers, items, warehouses] = await Promise.all([
    container().parties.list(ctx, { role: 'supplier' }),
    container().warehouse.items(ctx),
    container().warehouse.warehouses(ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Registrar factura de proveedor"
        description="Escríbela a mano, o haz una foto o sube el archivo (PDF) que te mandó el proveedor y se rellena sola. Al registrarla, los artículos de almacén entran en stock."
        back={{ href: `/o/${org}/compras/facturas`, label: 'Facturas recibidas' }}
      />
      <Cell>
        <ReceivedInvoiceEntry
          action={createInvoice.bind(null, org, 'received')}
          scan={scanReceivedInvoice.bind(null, org)}
          scanReady={scanConfigured()}
          accept={SCAN_ACCEPT}
          createSupplier={can('parties.write') && has(FEATURES.parties) ? createSupplierFromScan.bind(null, org) : null}
          createItem={can('inventory.write') && has(FEATURES.inventory) ? createItemFromScan.bind(null, org) : null}
          suppliers={suppliers.map((s) => ({ value: s.id, label: s.legalName }))}
          warehouses={warehouses.filter((w) => w.isActive).map((w) => ({ value: w.id, label: w.name }))}
          items={items
            .filter((i) => i.isActive)
            .map((i) => ({
              id: i.id,
              sku: i.sku,
              name: i.name,
              unit: i.unitOfMeasure,
              // Coste por unidad de stock; la línea lo pasa a precio por caja si va en cajas.
              suggested: Number(i.avgUnitCost) ? Number(i.avgUnitCost).toString() : '',
              taxRate: i.defaultTaxRate,
              ...(i.itemType === 'stockable' && i.purchaseUnit ? { pack: { unit: i.purchaseUnit, size: i.purchasePackSize } } : {}),
            }))}
        />
      </Cell>
    </>
  );
}
