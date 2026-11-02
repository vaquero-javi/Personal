import 'server-only';
import { createSql, type Sql } from '@omnia/db';
import { createOrganizationsService } from '@omnia/organizations';
import { createPosService } from '@omnia/pos';
import { createRecipeService } from '@omnia/recipes';

// El pool se guarda en globalThis para no abrir uno nuevo en cada recarga de
// `next dev`; los servicios se recrean con el módulo para no quedarse con
// código viejo tras editar un paquete.
const globalForSql = globalThis as unknown as { omniaTpvSql?: Sql };

function build() {
  const sql = (globalForSql.omniaTpvSql ??= createSql());
  return {
    sql,
    organizations: createOrganizationsService(sql),
    pos: createPosService(sql),
    recipes: createRecipeService(sql),
  };
}

let services: ReturnType<typeof build> | undefined;

export function container() {
  return (services ??= build());
}
