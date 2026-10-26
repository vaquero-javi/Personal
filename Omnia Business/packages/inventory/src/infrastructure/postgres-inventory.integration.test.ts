import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTenantContext } from '@omnia/auth';
import type { TenantContext } from '@omnia/core';
import { createSql, withTenant, withUser, type Sql } from '@omnia/db';
import { createGoodsReceiptService } from '../application/goods-receipt.service';
import { createPostgresInventoryUnitOfWork } from './postgres-inventory';

// Integración real: postgres.js → protocolo de red → Postgres (PGlite) con las
// migraciones del repo. Ejercita RLS, triggers y transacciones de verdad.

const MIGRATIONS = new URL('../../../../supabase/migrations/', import.meta.url);
const PORTABLE = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && !f.includes('supabase')).sort();

const ANA = '11111111-1111-4111-8111-111111111111';
const BETO = '22222222-2222-4222-8222-222222222222';

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let acme: TenantContext;
let beta: TenantContext;
let warehouseId: string;
let supplierId: string;
let itemIds: [string, string];

beforeAll(async () => {
  db = new PGlite();
  for (const file of PORTABLE) await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  await db.query(`insert into users (id, email) values ($1, 'ana@acme.es'), ($2, 'beto@beta.es')`, [ANA, BETO]);

  const port = 55_000 + Math.floor(Math.random() * 5_000);
  server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();
  process.env.DATABASE_POOL_MAX = '1'; // PGlite atiende una conexión
  sql = createSql(`postgres://postgres@127.0.0.1:${port}/postgres`);

  const createOrg = (userId: string, slug: string) =>
    withUser(sql, userId, async (tx) => {
      const [row] = await tx<{ id: string }[]>`select app.create_organization(${slug}, ${slug}, 'B00000000') as id`;
      return row!.id;
    });
  const acmeId = await createOrg(ANA, 'acme');
  const betaId = await createOrg(BETO, 'beta');
  acme = await resolveTenantContext(sql, ANA, [acmeId]);
  beta = await resolveTenantContext(sql, BETO, [betaId]);

  await withTenant(sql, acme, async (tx) => {
    const [warehouse] = await tx<{ id: string }[]>`
      insert into warehouses (organization_id, code, name) values (${acmeId}, 'CEN', 'Central') returning id`;
    const [supplier] = await tx<{ id: string }[]>`
      insert into parties (organization_id, is_supplier, legal_name) values (${acmeId}, true, 'Tornillos SA') returning id`;
    warehouseId = warehouse!.id;
    supplierId = supplier!.id;
    const items = await tx<{ id: string }[]>`
      insert into inventory_items (organization_id, sku, name)
      values (${acmeId}, 'T-6', 'Tornillo M6'), (${acmeId}, 'T-8', 'Tornillo M8')
      returning id`;
    itemIds = [items[0]!.id, items[1]!.id];
    await tx`
      insert into custom_field_definitions (organization_id, entity, key, label, data_type)
      values (${acmeId}, 'goods_receipt', 'pallets', 'Palés', 'number')`;
  });
}, 60_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

describe('Entrada de mercancía sobre Postgres', () => {
  const service = () => createGoodsReceiptService(createPostgresInventoryUnitOfWork(sql));
  const draft = (note: string) => ({
    warehouseId,
    supplierId,
    supplierDeliveryNote: note,
    customFields: { pallets: 2 },
    lines: [
      { itemId: itemIds[1], quantity: '4', unitCost: '0.20' },
      { itemId: itemIds[0], quantity: 10, unitCost: '0.10' },
      { itemId: itemIds[0], quantity: '5', unitCost: '0.16' },
    ],
  });

  it('crea el borrador, contabiliza y actualiza el saldo con coste medio', async () => {
    const receipt = await service().create(acme, draft('ALB-1'));
    expect(receipt).toMatchObject({ status: 'draft', number: 1 });

    const result = await service().post(acme, receipt.id);
    expect(result.alreadyPosted).toBe(false);
    expect(result.receipt.status).toBe('posted');

    const m6 = result.levels.find((l) => l.itemId === itemIds[0]);
    expect(Number(m6?.onHand)).toBe(15);

    const [level] = await withTenant(sql, acme, (tx) =>
      tx<{ avg_unit_cost: string }[]>`select avg_unit_cost from stock_levels where item_id = ${itemIds[0]}`);
    expect(Number(level?.avg_unit_cost)).toBeCloseTo(0.12, 6); // (10·0.10 + 5·0.16) / 15
  });

  it('es idempotente frente a reintentos concurrentes', async () => {
    const receipt = await service().create(acme, draft('ALB-2'));
    const results = await Promise.all([service().post(acme, receipt.id), service().post(acme, receipt.id)]);
    expect(results.filter((r) => r.alreadyPosted)).toHaveLength(1);

    const [{ n }] = (await withTenant(sql, acme, (tx) =>
      tx`select count(*)::int as n from stock_movements where source_id = ${receipt.id}`)) as unknown as [{ n: number }];
    expect(n).toBe(3);
  });

  it('rechaza el mismo albarán de proveedor dos veces', async () => {
    await expect(service().create(acme, draft('ALB-1'))).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('otra empresa no ve ni contabiliza el albarán', async () => {
    const receipt = await service().create(acme, draft('ALB-3'));
    await expect(service().post(beta, receipt.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service().create(beta, draft('ALB-X'))).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('el usuario no puede ponerse en el contexto de una empresa ajena', async () => {
    await expect(resolveTenantContext(sql, BETO, acme.organizationIds)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('traduce la falta de existencias a INSUFFICIENT_STOCK', async () => {
    const issue = withTenant(sql, acme, (tx) => tx`
      insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity)
      values (${acme.organizationIds[0]}, ${warehouseId}, ${itemIds[1]}, 'issue', -1000)`);
    await expect(issue).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });
});
