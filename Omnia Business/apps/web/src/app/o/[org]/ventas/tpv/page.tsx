import { PageHeader } from '@/components/ui/layout';
import { Notice } from '@/components/ui/form';
import { PointOfSale } from '@/features/sales/pos';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { posCheckout } from '../actions';

export const metadata = { title: 'TPV · Omnia' };

export default async function PosPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { ctx, org, can } = await requireOrg(slug);
  const [warehouses, tickets] = await Promise.all([container().warehouse.warehouses(ctx), container().sales.recentTickets(ctx)]);
  return (
    <>
      <PageHeader
        title="Punto de venta"
        description={tickets.length ? `Último ticket ${tickets[0]!.fullNumber} · ${tickets.length} en la lista reciente` : 'Venta de mostrador con ticket (factura simplificada)'}
      />
      {can('sales.write') ? (
        <PointOfSale orgId={org.organizationId} warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))} checkout={posCheckout.bind(null, slug)} invoiceBase={`/o/${slug}/facturacion`} />
      ) : (
        <div className="p-5">
          <Notice tone="warning">Tu rol no puede cobrar en el TPV.</Notice>
        </div>
      )}
    </>
  );
}
