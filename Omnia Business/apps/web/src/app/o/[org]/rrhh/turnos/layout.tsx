import type { ReactNode } from 'react';
import { RequireFeature } from '@/components/entitlements/require-feature';
import { FEATURES } from '@/server/features';

/** Turnos: submódulo contratado. Por URL directa sin él, pantalla de «módulo no contratado». */
export default async function RrhhTurnosLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  return (
    <RequireFeature org={org} feature={FEATURES.hrShifts}>
      {children}
    </RequireFeature>
  );
}
