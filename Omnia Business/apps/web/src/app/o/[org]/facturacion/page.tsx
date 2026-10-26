import { PageHeader } from '@/components/ui/layout';
import { LinkButton } from '@/components/ui/button';
import { InvoiceList } from '@/features/invoicing/invoice-list';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Facturas emitidas · Omnia' };

export default async function IssuedInvoicesPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ estado?: string; q?: string }> }) {
  const { org } = await params;
  const { estado, q } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  const invoices = await container().invoicing.list(ctx, { direction: 'issued', ...(estado ? { status: estado } : {}), ...(q ? { search: q } : {}) });
  const base = `/o/${org}/facturacion`;
  return (
    <>
      <PageHeader
        title="Facturas emitidas"
        description="Numeración correlativa por serie y huella VeriFactu encadenada en cada emisión."
        actions={can('invoicing.write') && <LinkButton href={`${base}/nueva`} variant="primary">Nueva factura</LinkButton>}
      />
      <InvoiceList invoices={invoices} base={base} direction="issued" estado={estado} q={q} />
    </>
  );
}
