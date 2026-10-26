import { InvoiceEditorPage } from '@/features/invoicing/invoice-editor-page';

export const metadata = { title: 'Nueva factura · Omnia' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?desde=<id>` duplica una factura: mismos cliente y conceptos, fechas nuevas. */
export default async function NewInvoicePage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ desde?: string }> }) {
  const { org } = await params;
  const { desde } = await searchParams;
  return <InvoiceEditorPage org={org} {...(desde && UUID.test(desde) ? { copyFrom: desde } : {})} />;
}
