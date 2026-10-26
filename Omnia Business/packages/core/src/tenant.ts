import { DomainError } from './errors';

/**
 * Quién actúa y sobre qué organizaciones. Se construye una vez por petición,
 * después de verificar el JWT y comprobar las membresías (packages/auth), y se
 * propaga a Postgres como `app.user_id` / `app.org_ids` (packages/db).
 */
export interface TenantContext {
  readonly userId: string;
  /** Una organización para operar; varias solo para lecturas consolidadas de grupo. */
  readonly organizationIds: readonly [string, ...string[]];
  readonly requestId?: string;
}

/** Las escrituras siempre se hacen sobre una única organización. */
export function singleOrganization(ctx: TenantContext): string {
  if (ctx.organizationIds.length !== 1) {
    throw new DomainError('VALIDATION', 'Esta operación requiere una única organización activa', {
      organizationIds: ctx.organizationIds,
    });
  }
  return ctx.organizationIds[0];
}
