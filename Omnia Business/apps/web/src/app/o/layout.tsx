import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { hasPermission } from '@omnia/organizations';
import { MODULES } from '@/components/shell/modules';
import { Sidebar } from '@/components/shell/sidebar';
import { EntitlementsProvider } from '@/lib/entitlements';
import { unreadByOrganization } from '@omnia/messages';
import { container } from '@/server/container';
import { establishmentCookie, featureCatalog, me, myEstablishments, myMemberships, requireUserId } from '@/server/session';
import { signOut } from '@/server/session-actions';

/**
 * Ventana de la app: barra lateral (módulos y sociedades) y el contenido.
 * Vive en /o (sin parámetro) para no desmontarse al cambiar de sociedad.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const userId = await requireUserId();
  const [memberships, user, catalog, establishments, store, unread] = await Promise.all([
    myMemberships(),
    me(),
    featureCatalog(),
    myEstablishments(),
    cookies(),
    unreadByOrganization(container().sql, userId),
  ]);
  const establishmentsOf = (orgId: string) => establishments.filter((e) => e.organizationId === orgId).map(({ id, name }) => ({ id, name }));
  // Empresa elegida en cada sociedad (cookie), solo si sigue siendo una empresa activa suya.
  const activeEstablishmentOf = (orgId: string) => {
    const id = store.get(establishmentCookie(orgId))?.value;
    return id && establishments.some((e) => e.organizationId === orgId && e.id === id) ? id : null;
  };
  return (
    <EntitlementsProvider
      organizations={memberships.map((m) => ({
        id: m.organizationId,
        slug: m.slug,
        features: m.features,
        canRequest: hasPermission(m.permissions, 'org.manage'),
      }))}
      catalog={catalog.map(({ code, parentCode, name, description, isCore }) => ({ code, parentCode, name, description, isCore }))}
    >
    <div className="flex min-h-dvh flex-col md:h-dvh md:flex-row">
      <Sidebar
        organizations={memberships.map((m) => ({
          id: m.organizationId,
          slug: m.slug,
          legalName: m.legalName,
          label: m.tradeName ?? m.legalName,
          spine: m.spineColor,
          roleName: m.roleName,
          // Por rol; lo contratado lo decide <FeatureGate> en la barra (con candado si puede pedirlo).
          modules: MODULES.filter((mod) => !mod.permission || hasPermission(m.permissions, mod.permission)).map((mod) => mod.slug),
          canManage: hasPermission(m.permissions, 'org.manage'),
          kind: m.kind,
          parentId: m.parentId,
          establishments: establishmentsOf(m.organizationId),
          activeEstablishmentId: activeEstablishmentOf(m.organizationId),
          unreadMessages: unread.get(m.organizationId) ?? 0,
        }))}
        user={{ name: user.fullName ?? user.email }}
        devMode={process.env.AUTH_MODE === 'dev'}
        signOut={signOut}
      />
      {children}
    </div>
    </EntitlementsProvider>
  );
}
