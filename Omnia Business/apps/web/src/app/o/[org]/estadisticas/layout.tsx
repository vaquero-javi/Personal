import type { ReactNode } from 'react';
import { SubNav } from '@/components/ui/sub-nav';
import { NoAccess } from '@/components/ui/no-access';
import { requireOrg } from '@/server/session';

export default async function StatsLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { can } = await requireOrg(org);
  if (!can('stats.read')) return <NoAccess module="Estadísticas" />;
  return (
    <>
      <SubNav
        base={`/o/${org}/estadisticas`}
        items={[
          { href: '', label: 'Cuadro de mando' },
          // Un día frente a otro, también hoy en tiempo real.
          { href: 'comparar', label: 'Comparación' },
          { href: 'resultados', label: 'Cuenta de resultados' },
          { href: 'estados', label: 'Estados financieros' },
          { href: 'informes', label: 'Informes de gestión' },
        ]}
      />
      {children}
    </>
  );
}
