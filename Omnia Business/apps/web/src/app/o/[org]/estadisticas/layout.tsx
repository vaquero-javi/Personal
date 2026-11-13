import type { ReactNode } from 'react';
import { RequireFeature } from '@/components/entitlements/require-feature';
import { SubNav } from '@/components/ui/sub-nav';
import { NoAccess } from '@/components/ui/no-access';
import { FEATURES } from '@/server/features';
import { requireOrg } from '@/server/session';

export default async function StatsLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { can, roleCan, org: membership } = await requireOrg(org);
  return (
    <RequireFeature org={org} feature={FEATURES.stats}>
      {can('stats.read') ? (
        <>
          <SubNav
            base={`/o/${org}/estadisticas`}
            upsell={roleCan('org.manage')}
            items={[
              { href: '', label: 'Cuadro de mando' },
              // Un día frente a otro, también hoy en tiempo real.
              { href: 'comparar', label: 'Comparación', feature: FEATURES.statsComparison },
              { href: 'resultados', label: 'Cuenta de resultados', feature: FEATURES.statsIncome },
              { href: 'estados', label: 'Estados financieros', feature: FEATURES.statsFinancial },
              { href: 'informes', label: 'Informes de gestión', feature: FEATURES.statsReports },
              ...(membership.kind === 'company' ? [{ href: 'empresas', label: 'Por empresa', feature: FEATURES.statsEstablishments }] : []),
            ]}
          />
          {children}
        </>
      ) : (
        <NoAccess module="Estadísticas" />
      )}
    </RequireFeature>
  );
}
