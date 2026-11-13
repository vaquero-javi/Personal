import type { ReactNode } from 'react';
import { RequireFeature } from '@/components/entitlements/require-feature';
import { SubNav } from '@/components/ui/sub-nav';
import { container } from '@/server/container';
import { FEATURES } from '@/server/features';
import { requireOrg } from '@/server/session';

/** Mensajes: correo interno de la sociedad (módulo contratable «Mensajes»). */
export default async function MessagesLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, has } = await requireOrg(org);
  const unread = has(FEATURES.messages) ? await container().messages.unreadCount(ctx) : 0;
  return (
    <RequireFeature org={org} feature={FEATURES.messages}>
      <SubNav
        base={`/o/${org}/mensajes`}
        items={[
          { href: '', label: 'Recibidos', count: unread },
          { href: 'destacados', label: 'Destacados' },
          { href: 'enviados', label: 'Enviados' },
          { href: 'archivados', label: 'Archivados' },
        ]}
      />
      {children}
    </RequireFeature>
  );
}
