// Postgres local para desarrollo, sin Docker ni Supabase: PGlite (Postgres en
// WASM) persistido en .data/pglite y expuesto por socket en 127.0.0.1:54329.
//
//   npm run db:dev      arranca (aplica migraciones pendientes; siembra si está vacía)
//   npm run db:reset    borra los datos y vuelve a sembrar
//
// La app se conecta con DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres
// y DATABASE_POOL_MAX=1 (PGlite atiende una conexión a la vez).

import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { seed } from './seed.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dataDir = `${root}.data/pglite`;
const migrationsDir = `${root}supabase/migrations`;
const port = Number(process.env.DEV_DB_PORT ?? 54329);

if (process.argv.includes('--reset')) {
  rmSync(dataDir, { recursive: true, force: true });
  console.log('Datos locales borrados.');
}
mkdirSync(dataDir, { recursive: true });

const db = new PGlite(dataDir);
await db.exec('create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())');

const applied = new Set((await db.query('select name from public.schema_migrations')).rows.map((r) => r.name));
// 0005 es específica de Supabase (auth.users, roles anon/authenticated).
const pending = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql') && !f.includes('_supabase') && !applied.has(f))
  .sort();

for (const file of pending) {
  await db.transaction(async (tx) => {
    await tx.exec(readFileSync(`${migrationsDir}/${file}`, 'utf8'));
    await tx.query('insert into public.schema_migrations (name) values ($1)', [file]);
  });
  console.log(`Migración aplicada: ${file}`);
}

const { rows } = await db.query('select count(*)::int as n from public.organizations');
if (rows[0].n === 0) {
  await seed(db);
  console.log('Datos de ejemplo sembrados.');
}

const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
await server.start();
console.log(`Postgres local listo en postgres://postgres@127.0.0.1:${port}/postgres`);

const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
