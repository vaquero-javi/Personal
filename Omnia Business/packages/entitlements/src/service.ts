import { z } from 'zod';
import { DomainError, type TenantContext, singleOrganization } from '@omnia/core';
import { asRows, withoutUser, withTenant, withUser, type Sql } from '@omnia/db';
import {
  AdminOrganization,
  AdminOrganizationFeature,
  FeatureCode,
  FeatureDefinition,
  RequestFeatureInput,
  SetFeatureInput,
  hasFeature,
  type AdminOrganizationFeatures,
} from './domain';

const OrganizationId = z.uuid('Sociedad no válida');

/** Error con el payload estable que espera el cliente: { error: 'FEATURE_DISABLED', required_feature }. */
export function featureDisabled(code: string, name?: string): DomainError {
  return new DomainError(
    'FEATURE_DISABLED',
    name ? `Tu sociedad no tiene contratado el módulo «${name}»` : 'Tu sociedad no tiene contratado este módulo',
    { error: 'FEATURE_DISABLED', required_feature: code },
  );
}

/** Puerto de lectura que necesitan los guardas (permite dobles en tests). */
export interface EntitlementsReader {
  catalog(): Promise<FeatureDefinition[]>;
  /** Módulos efectivos de cada sociedad activa del contexto. */
  resolve(ctx: TenantContext): Promise<Map<string, Set<string>>>;
}

export function createEntitlementsService(sql: Sql) {
  async function catalog(): Promise<FeatureDefinition[]> {
    const rows = await withoutUser(sql, (tx) => tx`
      select code, parent_code, name, description, is_core, default_enabled, permission_gates, sort_order
      from features order by sort_order, code`);
    return z.array(FeatureDefinition).parse(asRows(rows));
  }

  async function resolve(ctx: TenantContext): Promise<Map<string, Set<string>>> {
    const rows = await withTenant(sql, ctx, (tx) =>
      tx<{ organization_id: string; feature_code: string }[]>`select organization_id, feature_code from app.entitled_features()`,
    );
    // Toda sociedad del contexto aparece, aunque no tenga nada (p. ej. sin membresía): así nunca se asume acceso.
    const byOrg = new Map<string, Set<string>>(ctx.organizationIds.map((id) => [id, new Set<string>()]));
    for (const row of rows) byOrg.get(row.organization_id)?.add(row.feature_code);
    return byOrg;
  }

  return {
    catalog,
    resolve,

    /** Lista efectiva de la única sociedad activa (GET /api/v1/entitlements). */
    async forOrganization(ctx: TenantContext): Promise<{ organizationId: string; features: string[] }> {
      const organizationId = singleOrganization(ctx);
      const features = [...((await resolve(ctx)).get(organizationId) ?? [])].sort();
      return { organizationId, features };
    },

    /**
     * Guarda: lanza FEATURE_DISABLED si alguna sociedad del contexto no tiene el
     * módulo o alguno de sus padres. En vistas de grupo se exige en todas.
     */
    async require(ctx: TenantContext, rawCode: string): Promise<void> {
      const code = FeatureCode.parse(rawCode);
      const byOrg = await resolve(ctx);
      if ([...byOrg.values()].every((features) => hasFeature(features, code))) return;
      const name = (await catalog()).find((f) => f.code === code)?.name;
      throw featureDisabled(code, name);
    },

    /** La sociedad pide a Omnia que le active un módulo (exige org.manage). */
    async request(ctx: TenantContext, raw: unknown): Promise<{ id: string }> {
      const input = RequestFeatureInput.parse(raw);
      singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [row] = await tx<{ id: string }[]>`select app.request_feature(${input.featureCode}, ${input.message ?? null}) as id`;
        return { id: row!.id };
      });
    },

    // ---------------------------------------------------------------- plataforma

    async isPlatformAdmin(userId: string): Promise<boolean> {
      const [row] = await withUser(sql, userId, (tx) => tx<{ ok: boolean }[]>`select app.is_platform_admin() as ok`);
      return row?.ok === true;
    },

    async adminOrganizations(userId: string) {
      const rows = await withUser(sql, userId, (tx) => tx`select * from app.admin_organizations()`);
      return z.array(AdminOrganization).parse(asRows(rows));
    },

    async adminOrganizationFeatures(userId: string, rawOrgId: unknown): Promise<AdminOrganizationFeatures> {
      const orgId = OrganizationId.parse(rawOrgId);
      return withUser(sql, userId, async (tx) => {
        const features = z.array(AdminOrganizationFeature).parse(asRows(await tx`select * from app.admin_organization_features(${orgId})`));
        const organization = z
          .array(AdminOrganization)
          .parse(asRows(await tx`select * from app.admin_organizations() where id = ${orgId}`))[0];
        if (!organization) throw new DomainError('NOT_FOUND', 'Sociedad no encontrada');
        return { organization, features };
      });
    },

    async adminSetFeature(userId: string, rawOrgId: unknown, rawCode: unknown, raw: unknown): Promise<AdminOrganizationFeatures['features']> {
      const orgId = OrganizationId.parse(rawOrgId);
      const code = FeatureCode.parse(rawCode);
      const input = SetFeatureInput.parse(raw);
      return withUser(sql, userId, async (tx) => {
        await tx`select app.admin_set_feature(${orgId}, ${code}, ${input.isActive}, ${input.expiresAt ?? null}::text::timestamptz)`;
        return z.array(AdminOrganizationFeature).parse(asRows(await tx`select * from app.admin_organization_features(${orgId})`));
      });
    },
  };
}

export type EntitlementsService = ReturnType<typeof createEntitlementsService>;
