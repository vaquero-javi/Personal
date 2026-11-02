import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@omnia/core';
import { createSql, type Sql } from '@omnia/db';
import { createOrganizationsService } from '@omnia/organizations';
import { createStatsService, results } from '@omnia/stats';
import { DEMO_USERS, seed } from '../../scripts/seed.mjs';

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let stats: ReturnType<typeof createStatsService>;
let org: string;
let lucia: TenantContext; // propietaria
let carmen: TenantContext; // administración
let marta: TenantContext; // empleada

beforeAll(async () => {
  db = new PGlite();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && !f.includes('_supabase')).sort()) {
    await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  }
  await seed(db);
  const port = 55_000 + Math.floor(Math.random() * 5_000);
  server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();
  process.env.DATABASE_POOL_MAX = '1';
  sql = createSql(`postgres://postgres@127.0.0.1:${port}/postgres`);
  stats = createStatsService(sql);
  org = (await createOrganizationsService(sql).memberships(DEMO_USERS.lucia.id)).find((m) => m.slug === 'distribuciones-albar')!.organizationId;
  lucia = { userId: DEMO_USERS.lucia.id, organizationIds: [org] };
  carmen = { userId: DEMO_USERS.carmen.id, organizationIds: [org] };
  marta = { userId: DEMO_USERS.marta.id, organizationIds: [org] };
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

describe('Estadísticas', () => {
  it('la facturación por meses cuadra con las facturas emitidas', async () => {
    const months = await stats.monthly(lucia, '2020-01-01', '2030-12-01');
    const [{ base }] = (await db.query<{ base: string }>(
      `select coalesce(sum(subtotal), 0)::text as base from invoices
       where organization_id = $1 and direction = 'issued' and status in ('issued', 'partially_paid', 'paid')`, [org])).rows;
    expect(results(months).revenue).toBeCloseTo(Number(base), 2);
    expect(months).toHaveLength(132);
  });

  it('administración ve el balance; una empleada no ve nada', async () => {
    const snap = await stats.snapshot(carmen);
    expect(snap.receivable).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(snap.topCustomers)).toBe(true);
    await expect(stats.monthly(marta, '2026-01-01', '2026-12-01')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(stats.snapshot(marta)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
