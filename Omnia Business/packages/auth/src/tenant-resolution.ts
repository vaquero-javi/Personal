import { z } from 'zod';
import { DomainError, type TenantContext } from '@omnia/core';
import { withUser, type Sql } from '@omnia/db';

/** Cabecera con la(s) organización(es) activa(s): `<uuid>` o `<uuid>,<uuid>` (consolidado). */
export const ORGANIZATION_HEADER = 'x-organization-id';

const OrganizationScope = z.array(z.uuid()).max(50);

export function parseOrganizationScope(raw: string | null | undefined): string[] {
  const ids = (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const result = OrganizationScope.safeParse([...new Set(ids)]);
  if (!result.success) throw new DomainError('VALIDATION', `Cabecera ${ORGANIZATION_HEADER} no válida`);
  return result.data;
}

/**
 * Comprueba que el usuario es miembro activo de cada organización pedida y
 * construye el TenantContext. Sin cabecera, usa la organización por defecto.
 *
 * Es una comprobación temprana para responder 403 con claridad: aunque se
 * omitiera, RLS seguiría devolviendo cero filas fuera de las membresías.
 */
export async function resolveTenantContext(
  sql: Sql,
  userId: string,
  requested: readonly string[],
  requestId?: string,
): Promise<TenantContext> {
  const memberships = await withUser(sql, userId, (tx) =>
    tx<{ organization_id: string; is_default: boolean }[]>`
      select organization_id, is_default
      from user_organizations
      where user_id = ${userId} and status = 'active'
    `,
  );

  const memberOf = new Set(memberships.map((m) => m.organization_id));
  const fallback = memberships.find((m) => m.is_default) ?? (memberships.length === 1 ? memberships[0] : undefined);
  const organizationIds = requested.length > 0 ? requested : fallback ? [fallback.organization_id] : [];

  const [first, ...rest] = organizationIds;
  if (!first) {
    throw new DomainError('VALIDATION', 'Selecciona una organización', { header: ORGANIZATION_HEADER });
  }
  const outside = organizationIds.filter((id) => !memberOf.has(id));
  if (outside.length > 0) {
    throw new DomainError('FORBIDDEN', 'No perteneces a la organización solicitada', { organizationIds: outside });
  }

  return { userId, organizationIds: [first, ...rest], ...(requestId ? { requestId } : {}) };
}
