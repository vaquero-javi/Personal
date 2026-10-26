import { Cell, PageHeader } from '@/components/ui/layout';
import { SalesOrderForm } from '@/features/sales/order-form';
import { container } from '@/server/container';
import { requirePermission } from '@/server/session';
import { createSalesOrder } from '../../actions';

export const metadata = { title: 'Nuevo pedido de venta · Omnia' };

export default async function NewSalesOrderPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requirePermission(org, 'sales.write');
  const [customers, warehouses, items, lists] = await Promise.all([
    container().parties.list(ctx, { role: 'customer' }),
    container().warehouse.warehouses(ctx),
    container().warehouse.items(ctx),
    container().parties.priceLists(ctx),
  ]);
  const active = items.filter((i) => i.isActive);
  // Precio por tarifa: el formulario cambia los precios sugeridos al elegir cliente.
  const priceByList: Record<string, Record<string, string>> = {};
  for (const list of lists) {
    const prices = await container().parties.priceFor(ctx, active.map((i) => i.id), list.id);
    priceByList[list.id] = Object.fromEntries(prices);
  }
  const defaultList = lists.find((l) => l.isDefault)?.id ?? '';
  return (
    <>
      <PageHeader title="Nuevo pedido de cliente" back={{ href: `/o/${org}/ventas`, label: 'Pedidos' }} />
      <Cell>
        <SalesOrderForm
          action={createSalesOrder.bind(null, org)}
          customers={customers.map((c) => ({ value: c.id, label: c.legalName, priceListId: c.priceListId ?? defaultList }))}
          warehouses={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          items={active.map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unitOfMeasure, taxRate: Number(i.defaultTaxRate).toString() }))}
          priceByList={priceByList}
          defaultList={defaultList}
        />
      </Cell>
    </>
  );
}
