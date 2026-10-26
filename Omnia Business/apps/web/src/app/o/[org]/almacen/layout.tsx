import type { ReactNode } from 'react';
import { SubNav } from '@/components/ui/sub-nav';
import { NoAccess } from '@/components/ui/no-access';
import { requireOrg } from '@/server/session';

export default async function WarehouseLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { can } = await requireOrg(org);
  if (!can('inventory.read')) return <NoAccess module="Almacén" />;
  return (
    <>
      <SubNav
        base={`/o/${org}/almacen`}
        items={[
          { href: '', label: 'Existencias' },
          { href: 'articulos', label: 'Artículos' },
          { href: 'albaranes', label: 'Entradas (albaranes)' },
          { href: 'movimientos', label: 'Movimientos y ajustes' },
          { href: 'almacenes', label: 'Almacenes' },
        ]}
      />
      {children}
    </>
  );
}
