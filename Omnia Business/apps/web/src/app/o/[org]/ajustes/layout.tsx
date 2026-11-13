import type { ReactNode } from 'react';
import { SubNav } from '@/components/ui/sub-nav';
import { NoAccess } from '@/components/ui/no-access';
import { requireOrg } from '@/server/session';
import { FEATURES } from '@/server/features';

export default async function SettingsLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { can, roleCan, org: membership } = await requireOrg(org);
  if (!can('members.read')) return <NoAccess module="Ajustes" />;
  return (
    <>
      <SubNav
        base={`/o/${org}/ajustes`}
        upsell={roleCan('org.manage')}
        items={[
          { href: '', label: membership.kind === 'holding' ? 'Holding' : 'Sociedad' },
          ...(membership.kind === 'company' ? [{ href: 'empresas', label: 'Empresas' }] : []),
          { href: 'miembros', label: 'Miembros' },
          { href: 'roles', label: 'Roles y permisos' },
          { href: 'campos', label: 'Campos personalizados' },
          { href: 'tpv', label: 'TPV', feature: FEATURES.salesPos },
          { href: 'tarjetas', label: 'Tarjetas de empleado', feature: FEATURES.staffCards },
        ]}
      />
      {children}
    </>
  );
}
