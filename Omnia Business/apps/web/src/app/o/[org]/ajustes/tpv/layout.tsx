import type { ReactNode } from 'react';
import { RequireFeature } from '@/components/entitlements/require-feature';
import { FEATURES } from '@/server/features';

/** TPV: submódulo contratado. Por URL directa sin él, pantalla de «módulo no contratado». */
export default async function AjustesTpvLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  return (
    <RequireFeature org={org} feature={FEATURES.salesPos}>
      {children}
    </RequireFeature>
  );
}
