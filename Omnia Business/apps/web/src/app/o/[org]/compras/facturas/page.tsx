import { PageHeader } from '@/components/ui/layout';
import { LinkButton } from '@/components/ui/button';
import { InvoiceList } from '@/features/invoicing/invoice-list';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Facturas recibidas · Omnia' };

export default async function ReceivedInvoicesPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ estado?: string; q?: string }> }) {
  const { org } = await params;
  const { estado, q } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  const invoices = await container().invoicing.list(ctx, { direction: 'received', ...(estado ? { status: estado } : {}), ...(q ? { search: q } : {}) });
  const base = `/o/${org}/compras/facturas`;
  return (
    <>
      <PageHeader
        title="Facturas recibidas"
        description="Facturas de proveedores y su estado de pago."
        actions={can('invoicing.write') && <LinkButton href={`${base}/nueva`} variant="primary">Registrar factura</LinkButton>}
      />
      <InvoiceList invoices={invoices} base={base} direction="received" estado={estado} q={q} />
    </>
  );
}
