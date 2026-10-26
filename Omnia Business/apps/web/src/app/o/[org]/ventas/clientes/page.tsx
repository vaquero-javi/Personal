import { PartyList } from '@/features/parties/party-list';

export const metadata = { title: 'Clientes · Omnia' };

export default async function CustomersPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ q?: string }> }) {
  const { org } = await params;
  const { q } = await searchParams;
  return <PartyList org={org} role="customer" base={`/o/${org}/ventas/clientes`} q={q} />;
}
