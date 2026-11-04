import { PageHeader } from '@/components/ui/layout';
import { LinkButton } from '@/components/ui/button';
import { InvoiceList } from '@/features/invoicing/invoice-list';
import { listStatus } from '@/features/invoicing/list-params';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Facturas emitidas · Omnia' };

export default async function IssuedInvoicesPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ estado?: string; tipo?: string; q?: string; cursor?: string }> }) {
  const { org } = await params;
  const { estado, tipo, q, cursor } = await searchParams;
  const kind = tipo === 'facturas' ? 'invoice' : tipo === 'rectificativas' ? 'corrective' : tipo === 'tickets' ? 'ticket' : undefined;
  const { ctx, can } = await requireOrg(org);
  const page = await container().invoicing.listPage(ctx, { direction: 'issued', status: listStatus(estado), kind, search: q, cursor });
  const base = `/o/${org}/facturacion`;
  return (
    <>
      <PageHeader
        title="Facturas emitidas"
        description="Numeración correlativa por serie y huella VeriFactu encadenada en cada emisión."
        actions={can('invoicing.write') && <LinkButton href={`${base}/nueva`} variant="primary">Nueva factura</LinkButton>}
      />
      <InvoiceList page={page} cursor={cursor} base={base} direction="issued" estado={estado} tipo={tipo} q={q} />
    </>
  );
}
