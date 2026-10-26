import type { ReactNode } from 'react';
import { SubNav } from '@/components/ui/sub-nav';
import { NoAccess } from '@/components/ui/no-access';
import { requireOrg } from '@/server/session';

export default async function InvoicingLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { can } = await requireOrg(org);
  if (!can('invoicing.read')) return <NoAccess module="Facturación" />;
  return (
    <>
      <SubNav
        base={`/o/${org}/facturacion`}
        items={[
          { href: '', label: 'Facturas emitidas' },
          ...(can('invoicing.write') ? [{ href: 'nueva', label: 'Nueva factura' }] : []),
          { href: 'verifactu', label: 'Registros VeriFactu' },
          { href: 'series', label: 'Series' },
        ]}
      />
      {children}
    </>
  );
}
