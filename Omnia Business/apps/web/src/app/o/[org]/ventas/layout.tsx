import type { ReactNode } from 'react';
import { SubNav } from '@/components/ui/sub-nav';
import { NoAccess } from '@/components/ui/no-access';
import { requireOrg } from '@/server/session';
import { RequireFeature } from '@/components/entitlements/require-feature';
import { FEATURES } from '@/server/features';


export default async function SalesLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { can, roleCan } = await requireOrg(org);
  return (
    <RequireFeature org={org} feature={FEATURES.sales}>
      {can('sales.read') ? (
        <>
          <SubNav
            base={`/o/${org}/ventas`}
            upsell={roleCan('org.manage')}
            items={[
              { href: '', label: 'Pedidos B2B' },
              { href: 'clientes', label: 'Clientes' },
              { href: 'tarifas', label: 'Tarifas', feature: FEATURES.salesPriceLists },
            ]}
          />
          {children}
        </>
      ) : (
        <NoAccess module="Ventas" />
      )}
    </RequireFeature>
  );
}
