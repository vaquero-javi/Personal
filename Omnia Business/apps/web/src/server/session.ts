import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { DomainError, type TenantContext } from '@omnia/core';
import { hasPermission, type Membership } from '@omnia/organizations';
import { container } from './container';
import { ACCESS_TOKEN_COOKIE } from './supabase-auth';

export { ACCESS_TOKEN_COOKIE };

export const DEV_USER_COOKIE = 'omnia_dev_user';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Usuario de la petición.
 *  - AUTH_MODE=dev: cookie con el id elegido en /entrar (solo desarrollo local).
 *  - Resto: JWT del IdP (Supabase Auth u OIDC) en cookie httpOnly, verificado con JWKS.
 */
export const currentUserId = cache(async (): Promise<string | null> => {
  const store = await cookies();
  if (process.env.AUTH_MODE === 'dev') {
    const id = store.get(DEV_USER_COOKIE)?.value;
    return id && UUID.test(id) ? id : null;
  }
  const token = store.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  try {
    return (await container().verifyAccessToken!(token)).userId;
  } catch {
    return null;
  }
});

export async function requireUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) redirect('/entrar');
  return userId;
}

/** Sociedades del usuario (la estantería), una vez por petición. */
export const myMemberships = cache(async (): Promise<Membership[]> => {
  const userId = await requireUserId();
  return container().organizations.memberships(userId);
});

export interface OrgScope {
  ctx: TenantContext;
  org: Membership;
  can: (permission: string) => boolean;
}

/** Resuelve /o/<slug> contra las membresías: fuera de ellas, 404 (no se revela que existe). */
export const requireOrg = cache(async (slug: string): Promise<OrgScope> => {
  const userId = await requireUserId();
  const org = (await myMemberships()).find((m) => m.slug === slug);
  if (!org) notFound();
  return {
    ctx: { userId, organizationIds: [org.organizationId] },
    org,
    can: (permission) => hasPermission(org.permissions, permission),
  };
});

/** Para acciones: lanza en vez de redirigir si falta el permiso (la RLS lo impediría igualmente). */
export async function requirePermission(slug: string, permission: string): Promise<OrgScope> {
  const scope = await requireOrg(slug);
  if (!scope.can(permission)) throw new DomainError('FORBIDDEN', 'No tienes permiso para esta acción');
  return scope;
}

export const me = cache(async () => container().organizations.me(await requireUserId()));
