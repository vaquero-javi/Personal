import type { ReactNode } from 'react';
import { SubNav } from '@/components/ui/sub-nav';
import { NoAccess } from '@/components/ui/no-access';
import { requireOrg } from '@/server/session';
import { RequireFeature } from '@/components/entitlements/require-feature';
import { FEATURES } from '@/server/features';

export default async function WarehouseLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { can, roleCan } = await requireOrg(org);
  return (
    <RequireFeature org={org} feature={FEATURES.inventory}>
      {!can('inventory.read') ? <NoAccess module="Almacén" /> : <>
      <SubNav
        base={`/o/${org}/almacen`}
        upsell={roleCan('org.manage')}
        items={[
          { href: '', label: 'Existencias' },
          { href: 'articulos', label: 'Artículos' },
          { href: 'albaranes', label: 'Entradas (albaranes)', feature: FEATURES.goodsReceipts },
          { href: 'movimientos', label: 'Movimientos y ajustes', feature: FEATURES.stockMovements },
          { href: 'almacenes', label: 'Almacenes', feature: FEATURES.warehouses },
        ]}
      />
      {children}
      </>}
    </RequireFeature>
  );
}
