import type { ReactNode } from 'react';
import { SubNav } from '@/components/ui/sub-nav';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export default async function HrLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can } = await requireOrg(org);
  const unread = (await container().payroll.mine(ctx)).filter((p) => !p.viewedAt).length;
  return (
    <>
      <SubNav
        base={`/o/${org}/rrhh`}
        items={[
          { href: '', label: 'Fichar' },
          ...(can('hr.time.read') ? [{ href: 'registro', label: 'Registro de jornada' }] : []),
          { href: 'turnos', label: 'Turnos' },
          { href: 'ausencias', label: 'Vacaciones y permisos' },
          { href: 'nominas', label: 'Mis nóminas', count: unread },
          ...(can('hr.payroll.manage') ? [{ href: 'nominas/personal', label: 'Nóminas del personal' }] : []),
        ]}
      />
      {children}
    </>
  );
}
