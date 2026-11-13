import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@omnia/core';
import { createSql, type Sql } from '@omnia/db';
import { createHrService } from '@omnia/hr';
import { createWarehouseService } from '@omnia/inventory';
import { createSalesService } from '@omnia/sales';
import { createStatsService } from '@omnia/stats';
import { createOrganizationsService } from '@omnia/organizations';
import { DEMO_USERS, seed } from '../../scripts/seed.mjs';

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let orgs: ReturnType<typeof createOrganizationsService>;
let warehouses: ReturnType<typeof createWarehouseService>;
let hr: ReturnType<typeof createHrService>;
let stats: ReturnType<typeof createStatsService>;
let sales: ReturnType<typeof createSalesService>;
const lucia = DEMO_USERS.lucia.id;
const carmen = DEMO_USERS.carmen.id;

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
  orgs = createOrganizationsService(sql);
  warehouses = createWarehouseService(sql);
  hr = createHrService(sql);
  stats = createStatsService(sql);
  sales = createSalesService(sql);
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

const membership = async (userId: string, slug: string) => (await orgs.memberships(userId)).find((m) => m.slug === slug)!;
const ctxFor = async (userId: string, slug: string): Promise<TenantContext> => ({ userId, organizationIds: [(await membership(userId, slug)).organizationId] });

describe('Holding y sociedades', () => {
  it('la semilla agrupa las sociedades de Lucía bajo Grupo Albar', async () => {
    const all = await orgs.memberships(lucia);
    const grupo = all.find((m) => m.slug === 'grupo-albar')!;
    expect(grupo.kind).toBe('holding');
    expect(all.filter((m) => m.parentId === grupo.organizationId).map((m) => m.slug).sort()).toEqual(
      ['albar-logistica', 'bar-la-plaza', 'distribuciones-albar', 'talleres-albar'],
    );
  });

  it('crea un holding y una sociedad dentro', async () => {
    const holdingId = await orgs.create(lucia, { kind: 'holding', legalName: 'Inversiones Ferrer S.L.', taxId: 'B99000001', slug: 'inversiones-ferrer' });
    const companyId = await orgs.create(lucia, { kind: 'company', parentId: holdingId, legalName: 'Nueva Sociedad S.L.', taxId: 'B99000002', slug: 'nueva-sociedad' });
    const company = (await orgs.memberships(lucia)).find((m) => m.organizationId === companyId)!;
    expect(company.kind).toBe('company');
    expect(company.parentId).toBe(holdingId);
  });

  it('un holding no puede ir dentro de otro', async () => {
    const grupo = (await membership(lucia, 'grupo-albar')).organizationId;
    await expect(orgs.create(lucia, { kind: 'holding', parentId: grupo, legalName: 'X S.L.', taxId: 'B1', slug: 'x-holding' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('mover una sociedad de holding exige gestionar las dos', async () => {
    const otro = (await membership(lucia, 'inversiones-ferrer')).organizationId;
    await orgs.setParent(await ctxFor(lucia, 'talleres-albar'), { parentId: otro });
    expect((await membership(lucia, 'talleres-albar')).parentId).toBe(otro);
    await orgs.setParent(await ctxFor(lucia, 'talleres-albar'), { parentId: '' });
    expect((await membership(lucia, 'talleres-albar')).parentId).toBeNull();
    // Carmen administra el bar, pero no gestiona la sociedad (sin org.manage).
    await expect(orgs.setParent(await ctxFor(carmen, 'bar-la-plaza'), { parentId: '' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('Empresas (negocios o locales)', () => {
  it('el bar tiene dos empresas; el almacén de la barra es de «Bar La Plaza»', async () => {
    const list = await orgs.establishments(await ctxFor(lucia, 'bar-la-plaza'));
    expect(list.map((e) => e.name)).toEqual(['Bar La Plaza', 'Cafetería Centro']);
    expect(list[0]!.warehouseNames).toEqual(['Barra y cocina']);
    expect(list[1]!.warehouseCount).toBe(0);
  });

  it('crear, renombrar, desactivar y borrar', async () => {
    const ctx = await ctxFor(lucia, 'bar-la-plaza');
    const id = await orgs.saveEstablishment(ctx, { name: 'Terraza' });
    await orgs.saveEstablishment(ctx, { id, name: 'Terraza de verano', isActive: '' });
    let e = (await orgs.establishments(ctx)).find((x) => x.id === id)!;
    expect(e).toMatchObject({ name: 'Terraza de verano', isActive: false });
    await expect(orgs.saveEstablishment(ctx, { name: 'terraza de VERANO' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await orgs.deleteEstablishment(ctx, id);
    e = (await orgs.establishments(ctx)).find((x) => x.id === id)!;
    expect(e).toBeUndefined();
  });

  it('un almacén se asigna a una empresa de su sociedad, nunca de otra', async () => {
    const bar = await ctxFor(lucia, 'bar-la-plaza');
    const dist = await ctxFor(lucia, 'distribuciones-albar');
    const cafeteria = (await orgs.establishments(bar)).find((e) => e.name === 'Cafetería Centro')!.id;
    await warehouses.createWarehouse(bar, { code: 'CAF', name: 'Cafetería', establishmentId: cafeteria });
    expect((await warehouses.warehouses(bar)).find((w) => w.code === 'CAF')).toMatchObject({ establishmentName: 'Cafetería Centro' });

    const central = (await warehouses.warehouses(dist))[0]!;
    await expect(warehouses.setWarehouseEstablishment(dist, { warehouseId: central.id, establishmentId: cafeteria })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('un empleado ve las empresas pero no las crea', async () => {
    const marta = await ctxFor(DEMO_USERS.marta.id, 'bar-la-plaza');
    expect((await orgs.establishments(marta)).length).toBeGreaterThan(0);
    await expect(orgs.saveEstablishment(marta, { name: 'Por mi cuenta' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('Fase 2: personal, turnos, fichajes y cifras por empresa', () => {
  const est = async (slug: string, name: string) => (await orgs.establishments(await ctxFor(lucia, slug))).find((e) => e.name === name)!;

  it('la semilla asigna el personal del bar a sus locales', async () => {
    const bar = await est('bar-la-plaza', 'Bar La Plaza');
    const cafe = await est('bar-la-plaza', 'Cafetería Centro');
    expect(bar.memberNames).toEqual(expect.arrayContaining(['Carmen Vidal', 'Marta Ortega', 'Iván Serrano']));
    expect(cafe.memberNames).toEqual(['Iván Serrano']);
  });

  it('asignar y quitar personal exige gestionar miembros', async () => {
    const ctx = await ctxFor(lucia, 'bar-la-plaza');
    const cafe = await est('bar-la-plaza', 'Cafetería Centro');
    await orgs.setEstablishmentMember(ctx, { establishmentId: cafe.id, userId: DEMO_USERS.marta.id, assigned: 'on' });
    expect((await est('bar-la-plaza', 'Cafetería Centro')).memberIds).toContain(DEMO_USERS.marta.id);
    await orgs.setEstablishmentMember(ctx, { establishmentId: cafe.id, userId: DEMO_USERS.marta.id, assigned: '' });
    expect((await est('bar-la-plaza', 'Cafetería Centro')).memberIds).not.toContain(DEMO_USERS.marta.id);
    const marta = await ctxFor(DEMO_USERS.marta.id, 'bar-la-plaza');
    await expect(orgs.setEstablishmentMember(marta, { establishmentId: cafe.id, userId: DEMO_USERS.marta.id, assigned: 'on' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('quien trabaja en dos locales debe elegir dónde ficha; quien trabaja en uno, no', async () => {
    const ivan = await ctxFor(DEMO_USERS.ivan.id, 'bar-la-plaza');
    expect((await orgs.myEstablishments(ivan)).map((e) => e.name)).toEqual(['Bar La Plaza', 'Cafetería Centro']);
    await expect(hr.clock(ivan, { entryType: 'clock_in' })).rejects.toMatchObject({ code: 'VALIDATION' });
    const cafe = await est('bar-la-plaza', 'Cafetería Centro');
    await hr.clock(ivan, { entryType: 'clock_in', establishmentId: cafe.id });
    const mine = await hr.myDay(ivan);
    expect(mine.entries.at(-1)).toMatchObject({ entryType: 'clock_in', establishmentName: 'Cafetería Centro' });
  });

  it('el registro y los turnos se filtran por local', async () => {
    const lu = await ctxFor(lucia, 'bar-la-plaza');
    const bar = await est('bar-la-plaza', 'Bar La Plaza');
    const cafe = await est('bar-la-plaza', 'Cafetería Centro');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
    const cafeShifts = await hr.shifts(lu, today, 2, { establishmentId: cafe.id });
    expect(cafeShifts.length).toBeGreaterThan(0);
    expect(cafeShifts.every((s) => s.establishmentName === 'Cafetería Centro')).toBe(true);
    expect((await hr.shifts(lu, today, 2, { establishmentId: bar.id })).every((s) => s.userId !== DEMO_USERS.ivan.id)).toBe(true);
    const cafeDay = await hr.day(lu, today, 'all', { establishmentId: cafe.id });
    expect(cafeDay.map((r) => r.name)).toEqual(['Iván Serrano']);
  });

  it('un turno sin local va al único local de la persona', async () => {
    const lu = await ctxFor(lucia, 'bar-la-plaza');
    const tomorrow = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await hr.createShift(lu, { userId: DEMO_USERS.marta.id, date: tomorrow, from: '10:00', to: '14:00' });
    const created = (await hr.shifts(lu, tomorrow, 1)).find((s) => s.userId === DEMO_USERS.marta.id)!;
    expect(created.establishmentName).toBe('Bar La Plaza');
  });

  it('una empresa con fichajes no se borra: se desactiva', async () => {
    const lu = await ctxFor(lucia, 'bar-la-plaza');
    const cafe = await est('bar-la-plaza', 'Cafetería Centro');
    await expect(orgs.deleteEstablishment(lu, cafe.id)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('las ventas del TPV cuentan para el local del almacén de la barra', async () => {
    const lu = await ctxFor(lucia, 'bar-la-plaza');
    const year = new Date().getFullYear();
    const rows = await stats.establishments(lu, `${year - 1}-01-01`, `${year}-12-31`);
    const bar = rows.find((r) => r.name === 'Bar La Plaza')!;
    expect(bar.tickets).toBeGreaterThan(0);
    expect(bar.posBase).toBeGreaterThan(0);
    expect(bar.staff).toBe(3);
    expect(rows.find((r) => r.name === 'Cafetería Centro')!.tickets).toBe(0);
  });

  it('los pedidos de venta se filtran por el local de su almacén', async () => {
    const dist = await ctxFor(lucia, 'distribuciones-albar');
    const all = await sales.list(dist);
    const id = await orgs.saveEstablishment(dist, { name: 'Nave norte' });
    expect(await sales.list(dist, { establishmentId: id })).toEqual([]);
    expect(all.length).toBeGreaterThan(0);
  });
});
