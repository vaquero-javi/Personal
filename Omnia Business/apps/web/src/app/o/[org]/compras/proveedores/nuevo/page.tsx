import { NewPartyPage } from '@/features/parties/party-pages';

export const metadata = { title: 'Nuevo proveedor · Omnia' };

export default async function NewSupplierPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <NewPartyPage org={org} role="supplier" base={`/o/${org}/compras/proveedores`} />;
}
