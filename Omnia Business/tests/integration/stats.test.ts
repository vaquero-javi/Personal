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

describe('Comparación de días', () => {
  const madridToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

  it('las cifras de hoy cuadran con lo emitido, hora a hora y hasta una hora dada', async () => {
    const today = madridToday();
    const day = await stats.day(lucia, today, '23:59');
    const [row] = (await db.query<{ total: string; n: number }>(
      `select coalesce(sum(total), 0)::text as total, count(*)::int as n from invoices
       where organization_id = $1 and direction = 'issued' and status in ('issued', 'partially_paid', 'paid') and issue_date = $2`, [org, today])).rows;

    expect(day.isToday).toBe(true);
    expect(day.total).toBeCloseTo(Number(row!.total), 2);
    expect(day.count).toBe(row!.n);
    expect(day.hourly).toHaveLength(24);
    const byHour = day.hourly.reduce((t, h) => t + h.total, 0);
    expect(byHour + day.untimedTotal).toBeCloseTo(day.total, 2);
    expect(day.untilTotal).toBeCloseTo(byHour, 2);
    expect(day.cash + day.card + day.otherPayments).toBeLessThanOrEqual(day.total + 0.001);
  });

  it('otro día sin ventas sale a cero y sin cuentas abiertas; hasta una hora, también', async () => {
    const day = await stats.day(lucia, '2001-01-01', '12:00');
    expect(day).toMatchObject({ isToday: false, total: 0, count: 0, openTabs: 0, openTotal: 0, untilTotal: 0 });
    expect((await stats.day(lucia, '2001-01-01')).untilTotal).toBeNull();
  });

  it('una empleada sin permiso de estadísticas no ve el día', async () => {
    await expect(stats.day(marta, madridToday())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
