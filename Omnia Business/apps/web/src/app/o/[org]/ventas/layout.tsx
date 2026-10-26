import type { ReactNode } from 'react';
import { SubNav } from '@/components/ui/sub-nav';
import { NoAccess } from '@/components/ui/no-access';
import { requireOrg } from '@/server/session';

export default async function SalesLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { can } = await requireOrg(org);
  if (!can('sales.read')) return <NoAccess module="Ventas" />;
  return (
    <>
      <SubNav
        base={`/o/${org}/ventas`}
        items={[
          { href: '', label: 'Pedidos B2B' },
          { href: 'tpv', label: 'TPV' },
          { href: 'clientes', label: 'Clientes' },
          { href: 'tarifas', label: 'Tarifas' },
        ]}
      />
      {children}
    </>
  );
}
