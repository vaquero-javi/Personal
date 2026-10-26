import { PartyDetailPage } from '@/features/parties/party-pages';

export default async function SupplierPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <PartyDetailPage org={org} id={id} role="supplier" base={`/o/${org}/compras/proveedores`} />;
}
