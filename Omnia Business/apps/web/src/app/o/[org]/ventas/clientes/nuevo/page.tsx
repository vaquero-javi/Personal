import { NewPartyPage } from '@/features/parties/party-pages';

export const metadata = { title: 'Nuevo cliente · Omnia' };

export default async function NewCustomerPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <NewPartyPage org={org} role="customer" base={`/o/${org}/ventas/clientes`} />;
}
