// Contratos y reglas puras de los módulos contratados. Sin dependencias de
// servidor: los importa también el navegador (`@omnia/entitlements/contracts`).
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export const FEATURE_CODE = /^[a-z][a-z_]*(\.[a-z][a-z_]*)*$/;

export const FeatureCode = z.string().trim().regex(FEATURE_CODE, 'Código de módulo no válido').max(120);
export type FeatureCode = string;

/** Entrada del catálogo (igual para todas las sociedades). */
export const FeatureDefinition = z.object({
  code: FeatureCode,
  parentCode: FeatureCode.nullable(),
  name: z.string(),
  description: z.string(),
  isCore: z.boolean(),
  defaultEnabled: z.boolean(),
  permissionGates: z.array(z.string()),
  sortOrder: z.number().int(),
});
export type FeatureDefinition = z.infer<typeof FeatureDefinition>;

/** GET /api/v1/entitlements */
export const EntitlementsResponse = z.object({
  organizationId: z.uuid(),
  features: z.array(FeatureCode),
});
export type EntitlementsResponse = z.infer<typeof EntitlementsResponse>;

/** Payload de 403 cuando la sociedad no tiene el módulo. */
export const FeatureDisabledProblem = z.object({
  status: z.literal(403),
  code: z.literal('FEATURE_DISABLED'),
  error: z.literal('FEATURE_DISABLED'),
  required_feature: FeatureCode,
  detail: z.string(),
});
export type FeatureDisabledProblem = z.infer<typeof FeatureDisabledProblem>;

// ---------------------------------------------------------------------------
// Panel de plataforma
// ---------------------------------------------------------------------------

export const AdminOrganization = z.object({
  id: z.uuid(),
  slug: z.string(),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  taxId: z.string(),
  createdAt: z.coerce.date(),
  memberCount: z.number().int(),
  activeFeatures: z.array(FeatureCode),
  pendingRequests: z.number().int(),
});
export type AdminOrganization = z.infer<typeof AdminOrganization>;

export const AdminOrganizationFeature = z.object({
  code: FeatureCode,
  parentCode: FeatureCode.nullable(),
  name: z.string(),
  description: z.string(),
  isCore: z.boolean(),
  sortOrder: z.number().int(),
  /** Hay fila en organization_features (activa o no). */
  isAssigned: z.boolean(),
  /** Lo que Omnia ha marcado, sin mirar al padre ni la caducidad. */
  isActive: z.boolean(),
  /** Lo que la sociedad tiene de verdad: activo, sin caducar y con el padre activo. */
  isEffective: z.boolean(),
  activatedAt: z.coerce.date().nullable(),
  expiresAt: z.coerce.date().nullable(),
  updatedAt: z.coerce.date().nullable(),
  pendingRequestAt: z.coerce.date().nullable(),
  pendingRequestMessage: z.string().nullable(),
});
export type AdminOrganizationFeature = z.infer<typeof AdminOrganizationFeature>;

export const AdminOrganizationFeatures = z.object({
  organization: AdminOrganization,
  features: z.array(AdminOrganizationFeature),
});
export type AdminOrganizationFeatures = z.infer<typeof AdminOrganizationFeatures>;

/** PUT /api/v1/admin/organizations/:id/features/:code */
export const SetFeatureInput = z
  .object({
    isActive: z.boolean(),
    /** ISO 8601 con zona. null o ausente = sin caducidad. */
    expiresAt: z.iso.datetime({ offset: true, error: 'Fecha de caducidad no válida' }).nullable().optional(),
  })
  .strict()
  .refine((v) => !v.isActive || !v.expiresAt || new Date(v.expiresAt).getTime() > Date.now(), {
    message: 'La fecha de caducidad ya ha pasado',
    path: ['expiresAt'],
  });
export type SetFeatureInput = z.infer<typeof SetFeatureInput>;

/** POST /api/v1/entitlements/requests */
export const RequestFeatureInput = z
  .object({
    featureCode: FeatureCode,
    message: z.string().trim().max(500).optional(),
  })
  .strict();
export type RequestFeatureInput = z.infer<typeof RequestFeatureInput>;

// ---------------------------------------------------------------------------
// Reglas (réplica exacta de las funciones SQL, para decidir la interfaz)
// ---------------------------------------------------------------------------

/** 'sales.pos.staff_cards' → ['sales', 'sales.pos', 'sales.pos.staff_cards'] */
export function featureLineage(code: FeatureCode): FeatureCode[] {
  const parts = code.split('.');
  return parts.map((_, i) => parts.slice(0, i + 1).join('.'));
}

/**
 * ¿Está activo `code`? La lista que da el servidor ya es la efectiva (incluye
 * la regla del padre), pero se comprueba la cadena entera para que un código
 * mal escrito o un submódulo huérfano nunca den acceso.
 */
export function hasFeature(entitled: ReadonlySet<string> | readonly string[], code: FeatureCode): boolean {
  const set = entitled instanceof Set ? entitled : new Set(entitled as readonly string[]);
  return featureLineage(code).every((c) => set.has(c));
}

/** Réplica de app.permission_feature(): el módulo del prefijo más largo que cubre el permiso. */
export function permissionFeature(catalog: readonly Pick<FeatureDefinition, 'code' | 'permissionGates'>[], permission: string): FeatureCode | null {
  let best: { code: string; length: number } | null = null;
  for (const feature of catalog) {
    for (const prefix of feature.permissionGates) {
      const matches = permission === prefix || permission.startsWith(`${prefix}.`);
      if (!matches) continue;
      if (!best || prefix.length > best.length || (prefix.length === best.length && feature.code < best.code)) {
        best = { code: feature.code, length: prefix.length };
      }
    }
  }
  return best?.code ?? null;
}

/** Réplica del filtro que app.authorized_org_ids() añade a los permisos de rol. */
export function isPermissionEntitled(
  catalog: readonly Pick<FeatureDefinition, 'code' | 'permissionGates'>[],
  entitled: ReadonlySet<string> | readonly string[],
  permission: string,
): boolean {
  const gate = permissionFeature(catalog, permission);
  return gate === null || hasFeature(entitled, gate);
}

export interface FeatureNode<T extends Pick<FeatureDefinition, 'code' | 'parentCode' | 'sortOrder'>> {
  feature: T;
  children: FeatureNode<T>[];
}

/** Catálogo plano → árbol, ordenado por sort_order. */
export function featureTree<T extends Pick<FeatureDefinition, 'code' | 'parentCode' | 'sortOrder'>>(features: readonly T[]): FeatureNode<T>[] {
  const nodes = new Map(features.map((f) => [f.code, { feature: f, children: [] as FeatureNode<T>[] }]));
  const roots: FeatureNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.feature.parentCode ? nodes.get(node.feature.parentCode) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const sort = (list: FeatureNode<T>[]) => {
    list.sort((a, b) => a.feature.sortOrder - b.feature.sortOrder || a.feature.code.localeCompare(b.feature.code));
    for (const n of list) sort(n.children);
  };
  sort(roots);
  return roots;
}
