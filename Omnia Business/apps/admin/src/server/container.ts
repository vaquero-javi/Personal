import 'server-only';
import { createSql, type Sql } from '@omnia/db';
import { createEntitlementsService } from '@omnia/entitlements';
import { createOrganizationsService } from '@omnia/organizations';

// En producción, DATABASE_URL es la del rol omnia_admin (no la de la web).
const globalForSql = globalThis as unknown as { omniaAdminSql?: Sql };

function build() {
  const sql: Sql = (globalForSql.omniaAdminSql ??= createSql());
  return {
    sql,
    entitlements: createEntitlementsService(sql),
    organizations: createOrganizationsService(sql),
  };
}

let services: ReturnType<typeof build> | undefined;
export const container = () => (services ??= build());
