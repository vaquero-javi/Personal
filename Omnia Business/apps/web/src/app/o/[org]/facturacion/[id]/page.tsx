import { InvoiceView } from '@/features/invoicing/invoice-view';

export default async function InvoicePage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <InvoiceView org={org} id={id} back={{ href: `/o/${org}/facturacion`, label: 'Facturas emitidas' }} />;
}
