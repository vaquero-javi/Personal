import type { ReactNode } from 'react';
import { SubNav } from '@/components/ui/sub-nav';
import { NoAccess } from '@/components/ui/no-access';
import { requireOrg } from '@/server/session';
import { RequireFeature } from '@/components/entitlements/require-feature';
import { FEATURES } from '@/server/features';

export default async function InvoicingLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { can, roleCan } = await requireOrg(org);
  return (
    <RequireFeature org={org} feature={FEATURES.invoicing}>
      {!can('invoicing.read') ? <NoAccess module="Facturación" /> : <>
      <SubNav
        base={`/o/${org}/facturacion`}
        upsell={roleCan('org.manage')}
        items={[
          { href: '', label: 'Facturas emitidas' },
          ...(can('invoicing.write') ? [{ href: 'nueva', label: 'Nueva factura' }] : []),
          { href: 'verifactu', label: 'Registros VeriFactu', feature: FEATURES.verifactu },
          { href: 'series', label: 'Series', feature: FEATURES.invoiceSeries },
        ]}
      />
      {children}
      </>}
    </RequireFeature>
  );
}
