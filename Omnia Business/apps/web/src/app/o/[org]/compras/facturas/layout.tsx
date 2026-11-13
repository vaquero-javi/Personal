import type { ReactNode } from 'react';
import { RequireFeature } from '@/components/entitlements/require-feature';
import { FEATURES } from '@/server/features';

/** Facturas recibidas: submódulo contratado. Por URL directa sin él, pantalla de «módulo no contratado». */
export default async function ComprasFacturasLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  return (
    <RequireFeature org={org} feature={FEATURES.receivedInvoices}>
      {children}
    </RequireFeature>
  );
}
