import { Cell, PageHeader } from '@/components/ui/layout';
import { PurchaseOrderForm } from '@/features/purchasing/po-form';
import { container } from '@/server/container';
import { requirePermission } from '@/server/session';
import { createPurchaseOrder } from '../../actions';

export const metadata = { title: 'Nuevo pedido de compra · Omnia' };

export default async function NewPurchaseOrderPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requirePermission(org, 'purchasing.write');
  const [suppliers, warehouses, items] = await Promise.all([
    container().parties.list(ctx, { role: 'supplier' }),
    container().warehouse.warehouses(ctx),
    container().warehouse.items(ctx),
  ]);
  return (
    <>
      <PageHeader title="Nuevo pedido a proveedor" back={{ href: `/o/${org}/compras`, label: 'Pedidos' }} />
      <Cell>
        <PurchaseOrderForm
          action={createPurchaseOrder.bind(null, org)}
          suppliers={suppliers.map((s) => ({ value: s.id, label: s.legalName }))}
          warehouses={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          items={items.filter((i) => i.isActive && i.itemType !== 'service').map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unitOfMeasure, suggested: Number(i.avgUnitCost) ? Number(i.avgUnitCost).toString() : '', taxRate: i.defaultTaxRate }))}
        />
      </Cell>
    </>
  );
}
