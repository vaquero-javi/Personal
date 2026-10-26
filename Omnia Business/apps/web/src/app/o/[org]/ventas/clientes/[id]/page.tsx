import { PartyDetailPage } from '@/features/parties/party-pages';

export default async function CustomerPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <PartyDetailPage org={org} id={id} role="customer" base={`/o/${org}/ventas/clientes`} />;
}
