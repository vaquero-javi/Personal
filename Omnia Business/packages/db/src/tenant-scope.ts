import type { TenantContext } from '@omnia/core';
import type { Tx } from './client';
import { toPgUuidArray } from './tenant-transaction';

/**
 * Filtro explícito por organización para las consultas de listado.
 *
 * La RLS ya aísla los datos, pero su condición (`organization_id in (select
 * app.authorized_org_ids(…))`) es una subconsulta: Postgres no la usa como prefijo
 * de índice y recorre la tabla de **todas** las empresas antes de filtrar
 * (medido: Seq Scan sobre 120.000 facturas para devolver 50 de una empresa).
 * Repetir aquí la organización activa, ya validada contra las membresías, deja
 * que el índice `(organization_id, …)` haga el trabajo. La RLS sigue mandando:
 * esto solo acelera, nunca amplía lo visible.
 *
 *   tx`select … from invoices i where ${orgScope(tx, ctx, 'i.organization_id')} and …`
 *
 * Con una empresa se usa `=` (permite recorrer el índice ya ordenado). Con varias
 * (vista consolidada de grupo) `= any(…)`, que obliga a ordenar el resultado.
 */
export function orgScope(tx: Tx, ctx: TenantContext, column: string) {
  const ids = ctx.organizationIds;
  return ids.length === 1
    ? tx`${tx(column)} = ${ids[0]}::uuid`
    : tx`${tx(column)} = any(${toPgUuidArray(ids)}::uuid[])`;
}
