import type { ReactNode } from 'react';
import { SubNav } from '@/components/ui/sub-nav';
import { NoAccess } from '@/components/ui/no-access';
import { requireOrg } from '@/server/session';

export default async function PurchasingLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { can } = await requireOrg(org);
  if (!can('purchasing.read')) return <NoAccess module="Compras" />;
  return (
    <>
      <SubNav
        base={`/o/${org}/compras`}
        items={[
          { href: '', label: 'Pedidos a proveedor' },
          { href: 'facturas', label: 'Facturas recibidas' },
          { href: 'proveedores', label: 'Proveedores' },
        ]}
      />
      {children}
    </>
  );
}
