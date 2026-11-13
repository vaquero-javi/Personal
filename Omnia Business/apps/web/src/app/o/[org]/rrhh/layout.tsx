import type { ReactNode } from 'react';
import { SubNav } from '@/components/ui/sub-nav';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { FEATURES } from '@/server/features';

export default async function HrLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can, has, roleCan } = await requireOrg(org);
  const unread = has(FEATURES.hrPayroll) ? (await container().payroll.mine(ctx)).filter((p) => !p.viewedAt).length : 0;
  return (
    <>
      <SubNav
        base={`/o/${org}/rrhh`}
        upsell={roleCan('org.manage')}
        items={[
          { href: '', label: 'Fichar' },
          ...(can('hr.time.read') ? [{ href: 'registro', label: 'Registro de jornada' }] : []),
          { href: 'turnos', label: 'Turnos', feature: FEATURES.hrShifts },
          { href: 'ausencias', label: 'Vacaciones y permisos' },
          { href: 'nominas', label: 'Mis nóminas', count: unread, feature: FEATURES.hrPayroll },
          ...(can('hr.payroll.manage') ? [{ href: 'nominas/personal', label: 'Nóminas del personal', feature: FEATURES.hrPayroll }] : []),
        ]}
      />
      {children}
    </>
  );
}
