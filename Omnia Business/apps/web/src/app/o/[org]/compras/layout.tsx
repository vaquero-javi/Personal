import type { ReactNode } from 'react';
import { SubNav } from '@/components/ui/sub-nav';
import { NoAccess } from '@/components/ui/no-access';
import { requireOrg } from '@/server/session';
import { RequireFeature } from '@/components/entitlements/require-feature';
import { FEATURES } from '@/server/features';


export default async function PurchasingLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { can, roleCan } = await requireOrg(org);
  return (
    <RequireFeature org={org} feature={FEATURES.purchasing}>
      {can('purchasing.read') ? (
        <>
          <SubNav
            base={`/o/${org}/compras`}
            upsell={roleCan('org.manage')}
            items={[
              { href: '', label: 'Pedidos a proveedor' },
              { href: 'facturas', label: 'Facturas recibidas', feature: FEATURES.receivedInvoices },
              { href: 'comparador', label: 'Comparador de precios', feature: FEATURES.priceComparison },
              { href: 'proveedores', label: 'Proveedores' },
            ]}
          />
          {children}
        </>
      ) : (
        <NoAccess module="Compras" />
      )}
    </RequireFeature>
  );
}
