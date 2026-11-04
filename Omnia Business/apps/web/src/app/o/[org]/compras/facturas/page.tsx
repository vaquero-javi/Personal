import { PageHeader } from '@/components/ui/layout';
import { LinkButton } from '@/components/ui/button';
import { InvoiceList } from '@/features/invoicing/invoice-list';
import { listStatus } from '@/features/invoicing/list-params';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Facturas recibidas · Omnia' };

export default async function ReceivedInvoicesPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ estado?: string; q?: string; cursor?: string }> }) {
  const { org } = await params;
  const { estado, q, cursor } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  const page = await container().invoicing.listPage(ctx, { direction: 'received', status: listStatus(estado), search: q, cursor });
  const base = `/o/${org}/compras/facturas`;
  return (
    <>
      <PageHeader
        title="Facturas recibidas"
        description="Facturas de proveedores y su estado de pago."
        actions={can('invoicing.write') && <LinkButton href={`${base}/nueva`} variant="primary">Registrar factura</LinkButton>}
      />
      <InvoiceList page={page} cursor={cursor} base={base} direction="received" estado={estado} q={q} />
    </>
  );
}
