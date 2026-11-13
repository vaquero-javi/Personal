import { Cell, PageHeader } from '@/components/ui/layout';
import { ReceiptEntry } from '@/features/inventory/receipt-entry';
import { SCAN_ACCEPT, scanConfigured } from '@/server/delivery-note-reader';
import { container } from '@/server/container';
import { requirePermission } from '@/server/session';
import { createReceipt, scanReceipt } from '../../actions';
import { createItemFromScan, createSupplierFromScan } from '../../../compras/actions';
import { FEATURES } from '@/server/features';

export const metadata = { title: 'Registrar albarán · Omnia' };

export default async function NewReceiptPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can, has } = await requirePermission(org, 'inventory.write');
  const [suppliers, warehouses, items, fields] = await Promise.all([
    container().parties.list(ctx, { role: 'supplier' }),
    container().warehouse.warehouses(ctx),
    container().warehouse.items(ctx),
    container().organizations.customFields(ctx),
  ]);
  return (
    <>
      <PageHeader title="Registrar albarán de proveedor" description="Escríbelo a mano o haz una foto a la hoja y se rellena solo. Es el justificante de la entrega: el stock entra al registrar la factura del proveedor." back={{ href: `/o/${org}/almacen/albaranes`, label: 'Entradas' }} />
      <Cell>
        <ReceiptEntry
          action={createReceipt.bind(null, org)}
          scan={scanReceipt.bind(null, org)}
          scanReady={scanConfigured()}
          accept={SCAN_ACCEPT}
          createSupplier={can('parties.write') && has(FEATURES.parties) ? createSupplierFromScan.bind(null, org) : null}
          createItem={can('inventory.write') && has(FEATURES.inventory) ? createItemFromScan.bind(null, org) : null}
          suppliers={suppliers.map((s) => ({ value: s.id, label: s.legalName }))}
          warehouses={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          items={items
            .filter((i) => i.isActive && i.itemType === 'stockable')
            .map((i) => ({
              id: i.id,
              sku: i.sku,
              name: i.name,
              unit: i.unitOfMeasure,
              // Coste por unidad de stock; la línea lo pasa a coste por caja si va en cajas.
              suggested: Number(i.avgUnitCost) ? Number(i.avgUnitCost).toString() : '',
              taxRate: i.defaultTaxRate,
              ...(i.purchaseUnit ? { pack: { unit: i.purchaseUnit, size: i.purchasePackSize } } : {}),
            }))}
          customFields={fields.filter((f) => f.entity === 'goods_receipt')}
        />
      </Cell>
    </>
  );
}
