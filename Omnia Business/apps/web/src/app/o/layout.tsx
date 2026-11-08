import type { ReactNode } from 'react';
import { hasPermission } from '@omnia/organizations';
import { MODULES } from '@/components/shell/modules';
import { Sidebar } from '@/components/shell/sidebar';
import { me, myMemberships } from '@/server/session';
import { signOut } from '@/server/session-actions';

/**
 * Ventana de la app: barra lateral (módulos y sociedades) y el contenido.
 * Vive en /o (sin parámetro) para no desmontarse al cambiar de sociedad.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const [memberships, user] = await Promise.all([myMemberships(), me()]);
  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:flex-row">
      <Sidebar
        organizations={memberships.map((m) => ({
          id: m.organizationId,
          slug: m.slug,
          legalName: m.legalName,
          label: m.tradeName ?? m.legalName,
          spine: m.spineColor,
          roleName: m.roleName,
          modules: MODULES.filter((mod) => !mod.permission || hasPermission(m.permissions, mod.permission)).map((mod) => mod.slug),
        }))}
        user={{ name: user.fullName ?? user.email }}
        devMode={process.env.AUTH_MODE === 'dev'}
        signOut={signOut}
      />
      {children}
    </div>
  );
}
