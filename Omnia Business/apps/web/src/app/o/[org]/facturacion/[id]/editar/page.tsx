import { InvoiceEditorPage } from '@/features/invoicing/invoice-editor-page';

export const metadata = { title: 'Editar borrador · Omnia' };

export default async function EditInvoicePage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <InvoiceEditorPage org={org} draftId={id} />;
}
