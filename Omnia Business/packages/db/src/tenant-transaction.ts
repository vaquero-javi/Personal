import type { TenantContext } from '@omnia/core';
import type { Sql, Tx } from './client';
import { isRetryable, mapPgError } from './pg-errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toPgUuidArray(ids: readonly string[]): string {
  for (const id of ids) {
    if (!UUID.test(id)) throw new Error(`organization_id no válido: ${id}`);
  }
  return `{${ids.join(',')}}`;
}

interface TransactionOptions {
  /** Reintentos ante serialization_failure / deadlock. */
  maxAttempts?: number;
  statementTimeout?: '5s' | '15s' | '60s';
}

/**
 * Abre una transacción con la identidad de la petición:
 *
 *   SET LOCAL ROLE app_user                 → las políticas RLS se aplican
 *   set_config('app.user_id',  …, true)     → app.current_user_id()
 *   set_config('app.org_ids',  …, true)     → app.requested_org_ids()
 *
 * Todo es LOCAL a la transacción: al hacer COMMIT/ROLLBACK la conexión vuelve
 * limpia al pool, así que es seguro con poolers en modo transacción.
 */
async function runScoped<T>(
  sql: Sql,
  userId: string,
  organizationIds: readonly string[],
  work: (tx: Tx) => Promise<T>,
  { maxAttempts = 3, statementTimeout = '15s' }: TransactionOptions = {},
): Promise<T> {
  const orgIds = toPgUuidArray(organizationIds);

  for (let attempt = 1; ; attempt++) {
    try {
      const result = await sql.begin(async (tx) => {
        // Fechas de negocio («hoy», «este mes») en hora peninsular española.
        await tx.unsafe(`set local role app_user; set local statement_timeout = '${statementTimeout}'; set local timezone = 'Europe/Madrid'`);
        await tx`select set_config('app.user_id', ${userId}, true), set_config('app.org_ids', ${orgIds}, true)`;
        return work(tx);
      });
      return result as T;
    } catch (error) {
      if (attempt < maxAttempts && isRetryable(error)) {
        await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt + Math.random() * 20));
        continue;
      }
      throw mapPgError(error);
    }
  }
}

/** Transacción en el contexto de las organizaciones activas de la petición. */
export function withTenant<T>(sql: Sql, ctx: TenantContext, work: (tx: Tx) => Promise<T>, options?: TransactionOptions) {
  return runScoped(sql, ctx.userId, ctx.organizationIds, work, options);
}

/** Transacción sin organización activa: solo ve lo propio del usuario (membresías, perfil). */
export function withUser<T>(sql: Sql, userId: string, work: (tx: Tx) => Promise<T>) {
  return runScoped(sql, userId, [], work, { statementTimeout: '5s' });
}
