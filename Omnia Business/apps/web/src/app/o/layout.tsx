import type { ReactNode } from 'react';
import { SpineRail } from '@/components/shell/spine-rail';
import { myMemberships } from '@/server/session';

export default async function ShelfLayout({ children }: { children: ReactNode }) {
  const memberships = await myMemberships();
  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:flex-row">
      <SpineRail
        organizations={memberships.map((m) => ({
          id: m.organizationId,
          slug: m.slug,
          legalName: m.legalName,
          label: m.tradeName ?? m.legalName,
          spine: m.spineColor,
        }))}
      />
      {children}
    </div>
  );
}
