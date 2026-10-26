import { PartyList } from '@/features/parties/party-list';

export const metadata = { title: 'Proveedores · Omnia' };

export default async function SuppliersPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ q?: string }> }) {
  const { org } = await params;
  const { q } = await searchParams;
  return <PartyList org={org} role="supplier" base={`/o/${org}/compras/proveedores`} q={q} />;
}
