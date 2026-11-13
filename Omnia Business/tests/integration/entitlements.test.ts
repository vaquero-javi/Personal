import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@omnia/core';
import { createSql, type Sql } from '@omnia/db';
import { createEntitlementsService, isPermissionEntitled, type EntitlementsService } from '@omnia/entitlements';
import { createOrganizationsService } from '@omnia/organizations';
import { DEMO_PLATFORM_ADMIN, DEMO_USERS, seed } from '../../scripts/seed.mjs';

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let entitlements: EntitlementsService;
let logistica: string; // plan de entrada (sin TPV, Estadísticas ni Nóminas)
let distribuciones: string; // todo activo
let luciaLogi: TenantContext; // propietaria de la sociedad (no de la aplicación)
let carmenDist: TenantContext; // administración en Distribuciones, sin org.manage
const lucia = DEMO_USERS.lucia.id;
const carmen = DEMO_USERS.carmen.id;
const omnia = DEMO_PLATFORM_ADMIN.id; // propietario de la aplicación

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
  entitlements = createEntitlementsService(sql);
  const memberships = await createOrganizationsService(sql).memberships(lucia);
  logistica = memberships.find((m) => m.slug === 'albar-logistica')!.organizationId;
  distribuciones = memberships.find((m) => m.slug === 'distribuciones-albar')!.organizationId;
  luciaLogi = { userId: lucia, organizationIds: [logistica] };
  carmenDist = { userId: carmen, organizationIds: [distribuciones] };
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

describe('Resolución de módulos', () => {
  it('combina la base con lo activo de la sociedad', async () => {
    const { features } = await entitlements.forOrganization(luciaLogi);
    expect(features).toEqual(expect.arrayContaining(['base', 'inventory', 'invoicing', 'sales', 'purchasing']));
    expect(features).not.toContain('stats');
    expect(features).not.toContain('sales.pos');
  });

  it('las membresías traen los módulos de cada sociedad (una sola consulta para la barra lateral)', async () => {
    const memberships = await createOrganizationsService(sql).memberships(lucia);
    expect(memberships.find((m) => m.organizationId === distribuciones)!.features).toContain('stats');
    expect(memberships.find((m) => m.organizationId === logistica)!.features).not.toContain('stats');
  });

  it('la réplica en TypeScript coincide con la RLS', async () => {
    const catalog = await entitlements.catalog();
    const { features } = await entitlements.forOrganization(luciaLogi);
    for (const permission of ['stats.read', 'pos.use', 'sales.read', 'hr.payroll.manage', 'hr.time.self', 'members.manage', '*']) {
      const [row] = await sql.begin(async (tx) => {
        await tx.unsafe('set local role app_user');
        await tx`select set_config('app.user_id', ${lucia}, true), set_config('app.org_ids', ${`{${logistica}}`}, true)`;
        return tx<{ ok: boolean }[]>`select app.has_permission(${logistica}, ${permission}) as ok`;
      });
      expect(isPermissionEntitled(catalog, features, permission), permission).toBe(row!.ok);
    }
  });
});

describe('Guarda requireFeature', () => {
  it('lanza FEATURE_DISABLED con el payload estable', async () => {
    await expect(entitlements.require(luciaLogi, 'stats')).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
      details: { error: 'FEATURE_DISABLED', required_feature: 'stats' },
    });
  });

  it('exige también el módulo padre', async () => {
    await expect(entitlements.require(luciaLogi, 'sales.pos.staff_cards')).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });

  it('en vista de grupo exige el módulo en todas las sociedades', async () => {
    const group: TenantContext = { userId: lucia, organizationIds: [distribuciones, logistica] };
    await expect(entitlements.require(group, 'stats')).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(entitlements.require(group, 'sales')).resolves.toBeUndefined();
  });

  it('una sociedad ajena cuenta como sin módulos (nunca se asume acceso)', async () => {
    const outsider: TenantContext = { userId: DEMO_USERS.marta.id, organizationIds: [logistica] };
    await expect(entitlements.require(outsider, 'base')).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });

  it('rechaza códigos mal formados', async () => {
    await expect(entitlements.require(luciaLogi, "stats'; drop table features; --")).rejects.toThrow();
  });
});

describe('Panel de plataforma', () => {
  it('solo el equipo de Omnia', async () => {
    expect(await entitlements.isPlatformAdmin(omnia)).toBe(true);
    expect(await entitlements.isPlatformAdmin(lucia)).toBe(false); // propietaria de sus sociedades, no de Omnia
    expect(await entitlements.isPlatformAdmin(carmen)).toBe(false);
    await expect(entitlements.adminOrganizations(lucia)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(entitlements.adminSetFeature(lucia, logistica, 'stats', { isActive: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(entitlements.adminOrganizations(carmen)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(entitlements.adminSetFeature(carmen, logistica, 'stats', { isActive: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('valida la entrada antes de llegar a la base', async () => {
    await expect(entitlements.adminSetFeature(omnia, 'no-es-uuid', 'stats', { isActive: true })).rejects.toThrow();
    await expect(entitlements.adminSetFeature(omnia, logistica, 'stats', { isActive: 'yes' })).rejects.toThrow();
    await expect(entitlements.adminSetFeature(omnia, logistica, 'stats', { isActive: true, organizationId: distribuciones })).rejects.toThrow();
  });

  it('activar y desactivar tiene efecto inmediato para la sociedad', async () => {
    const after = await entitlements.adminSetFeature(omnia, logistica, 'stats', { isActive: true });
    expect(after.find((f) => f.code === 'stats')!.isEffective).toBe(true);
    expect((await entitlements.forOrganization(luciaLogi)).features).toContain('stats');

    await entitlements.adminSetFeature(omnia, logistica, 'stats', { isActive: false });
    expect((await entitlements.forOrganization(luciaLogi)).features).not.toContain('stats');
  });

  it('la matriz marca los hijos sin efecto cuando falta el padre', async () => {
    const rows = await entitlements.adminSetFeature(omnia, logistica, 'sales.pos.staff_cards', { isActive: true });
    const cards = rows.find((f) => f.code === 'sales.pos.staff_cards')!;
    expect(cards.isActive).toBe(true);
    expect(cards.isEffective).toBe(false);
  });

  it('también se quitan los módulos que antes eran base, y sus submódulos con ellos', async () => {
    const off = await entitlements.adminSetFeature(omnia, logistica, 'invoicing', { isActive: false });
    expect(off.find((f) => f.code === 'invoicing')!.isEffective).toBe(false);
    expect(off.find((f) => f.code === 'invoicing.series')!.isEffective).toBe(false);
    expect((await entitlements.forOrganization(luciaLogi)).features).not.toContain('invoicing');
    const on = await entitlements.adminSetFeature(omnia, logistica, 'invoicing', { isActive: true });
    expect(on.find((f) => f.code === 'invoicing.series')!.isEffective).toBe(true);
  });

  it('sociedad inexistente → NOT_FOUND', async () => {
    await expect(entitlements.adminOrganizationFeatures(omnia, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('Solicitudes de activación', () => {
  it('quien gestiona la sociedad pide, el panel lo ve y activar lo resuelve', async () => {
    await entitlements.request(luciaLogi, { featureCode: 'hr.payroll', message: 'Desde enero' });
    let row = (await entitlements.adminOrganizationFeatures(omnia, logistica)).features.find((f) => f.code === 'hr.payroll')!;
    expect(row.pendingRequestMessage).toBe('Desde enero');
    row = (await entitlements.adminSetFeature(omnia, logistica, 'hr.payroll', { isActive: true })).find((f) => f.code === 'hr.payroll')!;
    expect(row.pendingRequestAt).toBeNull();
  });

  it('sin org.manage no se puede pedir', async () => {
    await expect(entitlements.request(carmenDist, { featureCode: 'stats' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('claves desconocidas en la entrada se rechazan', async () => {
    await expect(entitlements.request(luciaLogi, { featureCode: 'stats', organizationId: distribuciones })).rejects.toThrow();
  });
});
