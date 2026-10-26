import type { ReactNode } from 'react';
import { SubNav } from '@/components/ui/sub-nav';
import { NoAccess } from '@/components/ui/no-access';
import { requireOrg } from '@/server/session';

export default async function SettingsLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { can } = await requireOrg(org);
  if (!can('members.read')) return <NoAccess module="Ajustes" />;
  return (
    <>
      <SubNav
        base={`/o/${org}/ajustes`}
        items={[
          { href: '', label: 'Sociedad' },
          { href: 'miembros', label: 'Miembros' },
          { href: 'roles', label: 'Roles y permisos' },
          { href: 'campos', label: 'Campos personalizados' },
        ]}
      />
      {children}
    </>
  );
}
