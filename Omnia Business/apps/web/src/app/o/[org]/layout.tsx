import type { ReactNode } from 'react';
import { spineCss } from '@/components/shell/spines';
import { Window } from '@/components/shell/window';
import { requireOrg } from '@/server/session';

export default async function OrganizationLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireOrg(slug);

  return (
    <Window
      toolbar={
        <>
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: spineCss(org.spineColor) }} />
          <h1 className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em]">{org.legalName}</h1>
        </>
      }
    >
      {children}
    </Window>
  );
}
