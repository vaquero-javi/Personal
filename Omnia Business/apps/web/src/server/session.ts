import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { DomainError, type TenantContext } from '@omnia/core';
import { featureDisabled, hasFeature, isPermissionEntitled, permissionFeature, type FeatureDefinition } from '@omnia/entitlements';
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

/** Módulos que Omnia oculta en cada una de mis sociedades (sociedad → códigos), una vez por petición. */
export const myHiddenFeatures = cache(async (): Promise<Map<string, string[]>> => container().entitlements.myHidden(await requireUserId()));

/** Catálogo de módulos (igual para todas las sociedades), una vez por petición. */
export const featureCatalog = cache((): Promise<FeatureDefinition[]> => container().entitlements.catalog());

export interface OrgScope {
  ctx: TenantContext;
  org: Membership;
  /** Rol Y módulo contratado: lo mismo que decide la RLS (app.authorized_org_ids). */
  can: (permission: string) => boolean;
  /** Módulo oculto por Omnia: si no se tiene, ni se enseña con candado ni existe la página. */
  hidden: (feature: string) => boolean;
  /** Solo el rol, sin mirar lo contratado (para decidir si se ofrece activar un módulo). */
  roleCan: (permission: string) => boolean;
  /** ¿La sociedad tiene el módulo (y todos sus padres)? */
  has: (feature: string) => boolean;
  catalog: FeatureDefinition[];
}

/** Resuelve /o/<slug> contra las membresías: fuera de ellas, 404 (no se revela que existe). */
export const requireOrg = cache(async (slug: string): Promise<OrgScope> => {
  const userId = await requireUserId();
  const [memberships, catalog, hiddenByOrg] = await Promise.all([myMemberships(), featureCatalog(), myHiddenFeatures()]);
  const org = memberships.find((m) => m.slug === slug);
  if (!org) notFound();
  const features = new Set(org.features);
  const roleCan = (permission: string) => hasPermission(org.permissions, permission);
  return {
    ctx: { userId, organizationIds: [org.organizationId] },
    org,
    catalog,
    roleCan,
    can: (permission) => roleCan(permission) && isPermissionEntitled(catalog, features, permission),
    has: (feature) => hasFeature(features, feature),
    hidden: (feature) => (hiddenByOrg.get(org.organizationId) ?? []).includes(feature),
  };
});

/**
 * Para acciones: lanza en vez de redirigir si falta el permiso (la RLS lo impediría igualmente).
 * `feature` añade un submódulo de interfaz que la RLS no cubre (p. ej. 'sales.price_lists').
 */
export async function requirePermission(slug: string, permission: string, feature?: string): Promise<OrgScope> {
  const scope = await requireOrg(slug);
  if (feature) assertFeature(scope, feature);
  if (scope.roleCan(permission) && !scope.can(permission)) {
    // El rol lo permite, pero la sociedad no tiene el módulo: error distinto para poder ofrecerlo.
    const gate = permissionFeature(scope.catalog, permission)!;
    throw featureDisabled(gate, scope.catalog.find((f) => f.code === gate)?.name);
  }
  if (!scope.can(permission)) throw new DomainError('FORBIDDEN', 'No tienes permiso para esta acción');
  return scope;
}

function assertFeature(scope: OrgScope, feature: string) {
  if (!scope.has(feature)) throw featureDisabled(feature, scope.catalog.find((f) => f.code === feature)?.name);
}

/** Guarda de acciones de un módulo, sin permiso de rol concreto. */
export async function requireFeature(slug: string, feature: string): Promise<OrgScope> {
  const scope = await requireOrg(slug);
  assertFeature(scope, feature);
  return scope;
}


/** Empresas activas de todas mis sociedades, una vez por petición (barra lateral). */
export const myEstablishments = cache(async () => container().organizations.myEstablishmentsAll(await requireUserId()));

/** Cookie (una por sociedad) con la empresa elegida en la barra superior. */
export const establishmentCookie = (organizationId: string) => `omnia_empresa_${organizationId}`;

/** Empresas (negocios o locales) de la sociedad, una vez por petición. */
export const orgEstablishments = cache(async (slug: string) => {
  const { ctx, org } = await requireOrg(slug);
  return org.kind === 'company' ? container().organizations.establishments(ctx) : [];
});

/**
 * Empresa elegida para filtrar la app (almacén, ventas, turnos, registro), o null
 * = todas. Se valida contra las empresas activas de la sociedad: una cookie con
 * un id ajeno o antiguo se ignora.
 */
export const activeEstablishment = cache(async (slug: string): Promise<{ id: string; name: string } | null> => {
  const { org } = await requireOrg(slug);
  const id = (await cookies()).get(establishmentCookie(org.organizationId))?.value;
  if (!id) return null;
  const found = (await orgEstablishments(slug)).find((e) => e.id === id && e.isActive);
  return found ? { id: found.id, name: found.name } : null;
});

export const me = cache(async () => container().organizations.me(await requireUserId()));
