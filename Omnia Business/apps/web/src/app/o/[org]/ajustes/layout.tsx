import type { ReactNode } from 'react';
import { SubNav } from '@/components/ui/sub-nav';
import { NoAccess } from '@/components/ui/no-access';
import { requireOrg } from '@/server/session';
import { FEATURES } from '@/server/features';
import { RequireFeature } from '@/components/entitlements/require-feature';

export default async function SettingsLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { can, roleCan, org: membership } = await requireOrg(org);
  return (
    <RequireFeature org={org} feature={FEATURES.base}>
      {!can('members.read') ? <NoAccess module="Ajustes" /> : <>
      <SubNav
        base={`/o/${org}/ajustes`}
        upsell={roleCan('org.manage')}
        items={[
          { href: '', label: membership.kind === 'holding' ? 'Holding' : 'Sociedad' },
          ...(membership.kind === 'company' ? [{ href: 'empresas', label: 'Empresas', feature: FEATURES.establishments }] : []),
          { href: 'miembros', label: 'Miembros', feature: FEATURES.members },
          { href: 'roles', label: 'Roles y permisos', feature: FEATURES.roles },
          { href: 'campos', label: 'Campos personalizados', feature: FEATURES.customFields },
          { href: 'tpv', label: 'TPV', feature: FEATURES.salesPos },
          { href: 'tarjetas', label: 'Tarjetas de empleado', feature: FEATURES.staffCards },
        ]}
      />
      {children}
      </>}
    </RequireFeature>
  );
}
