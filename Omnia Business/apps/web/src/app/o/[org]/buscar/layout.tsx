import type { ReactNode } from 'react';
import { RequireFeature } from '@/components/entitlements/require-feature';
import { FEATURES } from '@/server/features';

/** Buscar: módulo que da o quita el equipo de Omnia. Por URL directa sin él, pantalla de «módulo no contratado». */
export default async function BuscarLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  return (
    <RequireFeature org={org} feature={FEATURES.base}>
      {children}
    </RequireFeature>
  );
}
