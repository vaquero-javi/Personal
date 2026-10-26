import { Cell, PageHeader } from '@/components/ui/layout';
import { ReceiptEntry } from '@/features/inventory/receipt-entry';
import { SCAN_ACCEPT, scanConfigured } from '@/server/delivery-note-reader';
import { container } from '@/server/container';
import { requirePermission } from '@/server/session';
import { createReceipt, scanReceipt } from '../../actions';

export const metadata = { title: 'Registrar albarán · Omnia' };

export default async function NewReceiptPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requirePermission(org, 'inventory.write');
  const [suppliers, warehouses, items, fields] = await Promise.all([
    container().parties.list(ctx, { role: 'supplier' }),
    container().warehouse.warehouses(ctx),
    container().warehouse.items(ctx),
    container().organizations.customFields(ctx),
  ]);
  return (
    <>
      <PageHeader title="Registrar albarán de proveedor" description="Escríbelo a mano o haz una foto a la hoja y se rellena solo. Queda en borrador hasta que lo contabilices." back={{ href: `/o/${org}/almacen/albaranes`, label: 'Entradas' }} />
      <Cell>
        <ReceiptEntry
          action={createReceipt.bind(null, org)}
          scan={scanReceipt.bind(null, org)}
          scanReady={scanConfigured()}
          accept={SCAN_ACCEPT}
          suppliers={suppliers.map((s) => ({ value: s.id, label: s.legalName }))}
          warehouses={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          items={items
            .filter((i) => i.isActive && i.itemType === 'stockable')
            .map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unitOfMeasure, suggested: Number(i.avgUnitCost) ? Number(i.avgUnitCost).toString() : '', taxRate: i.defaultTaxRate }))}
          customFields={fields.filter((f) => f.entity === 'goods_receipt')}
        />
      </Cell>
    </>
  );
}
