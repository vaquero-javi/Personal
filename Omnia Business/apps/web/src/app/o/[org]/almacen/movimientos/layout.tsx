import type { ReactNode } from 'react';
import { RequireFeature } from '@/components/entitlements/require-feature';
import { FEATURES } from '@/server/features';

/** Movimientos y ajustes: módulo que da o quita el equipo de Omnia. Por URL directa sin él, pantalla de «módulo no contratado». */
export default async function AlmacenMovimientosLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  return (
    <RequireFeature org={org} feature={FEATURES.stockMovements}>
      {children}
    </RequireFeature>
  );
}
