import postgres from 'postgres';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

/**
 * Pool de conexiones del backend. Debe conectarse con un rol SIN `BYPASSRLS`
 * (`omnia_api`); el aislamiento entre empresas lo hace Postgres, no este código.
 */
export function createSql(url = process.env.DATABASE_URL): Sql {
  if (!url) throw new Error('DATABASE_URL no está definida');
  return postgres(url, {
    // Supavisor / PgBouncer / RDS Proxy en modo transacción no admiten
    // sentencias preparadas con nombre.
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connection: { application_name: 'omnia-api' },
    transform: { undefined: null },
  });
}
