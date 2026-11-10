import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@omnia/core';
import { createSql, type Sql } from '@omnia/db';
import { createInvoicingService } from '@omnia/invoicing';
import { createOrganizationsService } from '@omnia/organizations';
import { DEMO_USERS, seed } from '../../scripts/seed.mjs';

/**
 * El stock de compras entra al registrar la factura del proveedor (no con el
 * albarán): cada línea con artículo inventariable suma en el almacén de la
 * factura, convertida de cajas a unidades, y recalcula el coste medio.
 */

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let invoicing: ReturnType<typeof createInvoicingService>;
let lucia: TenantContext;
let orgId: string;
let supplierId: string;
let warehouseId: string;
let items: Record<string, string>;

const level = async (sku: string) => {
  const r = await db.query<{ on_hand: string; avg_unit_cost: string }>(
    `select coalesce(sum(on_hand), 0)::text as on_hand, coalesce(max(avg_unit_cost), 0)::text as avg_unit_cost
     from stock_levels where item_id = $1 and warehouse_id = $2`,
    [items[sku], warehouseId],
  );
  return { onHand: Number(r.rows[0]!.on_hand), avgCost: Number(r.rows[0]!.avg_unit_cost) };
};

let n = 0;
const register = (lines: Record<string, unknown>[], over: Record<string, unknown> = {}) =>
  invoicing.createDraft(lucia, {
    direction: 'received',
    partyId: supplierId,
    supplierNumber: `F-STOCK-${++n}`,
    issueDate: '2026-11-10',
    warehouseId,
    lines,
    ...over,
  });

beforeAll(async () => {
  db = new PGlite();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && !f.includes('_supabase')).sort()) {
    await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  }
  await seed(db);
  const port = 50_000 + Math.floor(Math.random() * 5_000);
  server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();
  process.env.DATABASE_POOL_MAX = '1';
  sql = createSql(`postgres://postgres@127.0.0.1:${port}/postgres`);
  invoicing = createInvoicingService(sql);

  const memberships = await createOrganizationsService(sql).memberships(DEMO_USERS.lucia.id);
  orgId = memberships.find((m) => m.slug === 'distribuciones-albar')!.organizationId;
  lucia = { userId: DEMO_USERS.lucia.id, organizationIds: [orgId] };
  supplierId = (await db.query<{ id: string }>(`select id from parties where organization_id = $1 and legal_name like 'Cervezas del Norte%'`, [orgId])).rows[0]!.id;
  warehouseId = (await db.query<{ id: string }>(`select id from warehouses where organization_id = $1 and is_active order by name limit 1`, [orgId])).rows[0]!.id;
  const rows = await db.query<{ sku: string; id: string }>(`select sku, id from inventory_items where organization_id = $1`, [orgId]);
  items = Object.fromEntries(rows.rows.map((r) => [r.sku, r.id]));
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

describe('stock desde facturas recibidas', () => {
  it('suma al stock las cajas convertidas a unidades y recalcula el coste medio', async () => {
    const before = await level('REF-COLA');
    // 2 cajas de 24 a 9,60 € la caja, con un 10 % de descuento → 0,36 € la lata.
    const id = await register([{ itemId: items['REF-COLA'], description: 'Refresco cola caja 24', quantity: '2', unitPrice: '9.60', discountPct: '10', taxRate: '10' }]);

    const after = await level('REF-COLA');
    expect(after.onHand).toBe(before.onHand + 48);
    const expectedAvg = (Math.max(before.onHand, 0) * before.avgCost + 48 * 0.36) / (Math.max(before.onHand, 0) + 48);
    expect(after.avgCost).toBeCloseTo(expectedAvg, 5);

    const moves = await db.query<{ movement_type: string; quantity: string; unit_cost: string; source_type: string; note: string }>(
      `select movement_type, quantity::text, unit_cost::text, source_type, note from stock_movements where source_id = $1`,
      [id],
    );
    expect(moves.rows).toEqual([{ movement_type: 'receipt', quantity: '48.0000', unit_cost: '0.360000', source_type: 'invoice', note: `Factura F-STOCK-${n}` }]);

    const detail = await invoicing.get(lucia, id);
    expect(detail.lines[0]!.packSize).toBe('24');
    expect(detail.warehouseName).not.toBeNull();
  });

  it('una línea en unidades sueltas entra tal cual', async () => {
    const before = await level('REF-COLA');
    await register([{ itemId: items['REF-COLA'], description: 'Latas sueltas', quantity: '5', unitPrice: '0.40', taxRate: '10', packSize: '1' }]);
    expect((await level('REF-COLA')).onHand).toBe(before.onHand + 5);
  });

  it('los conceptos libres y los servicios no tocan el stock', async () => {
    const id = await register([
      { description: 'Portes', quantity: '1', unitPrice: '12', taxRate: '21' },
      { itemId: items.TRANSPORTE ?? items['SRV-PORTE'], description: 'Portes y entrega', quantity: '1', unitPrice: '5', taxRate: '21' },
    ]);
    const moves = await db.query(`select 1 from stock_movements where source_id = $1`, [id]);
    expect(moves.rows).toHaveLength(0);
  });

  it('sin almacén no deja registrar una factura con artículos de almacén, y no queda nada a medias', async () => {
    const before = await level('CER-TER');
    await expect(
      register([{ itemId: items['CER-TER'], description: 'Tercio caja 24', quantity: '1', unitPrice: '9.6', taxRate: '21' }], { warehouseId: undefined, supplierNumber: 'F-SIN-ALMACEN' }),
    ).rejects.toThrow(/almacén/);
    expect((await level('CER-TER')).onHand).toBe(before.onHand);
    const inv = await db.query(`select 1 from invoices where full_number = 'F-SIN-ALMACEN'`);
    expect(inv.rows).toHaveLength(0);
  });

  it('rechaza una conversión que no es la del formato de compra', async () => {
    await expect(
      register([{ itemId: items['CER-TER'], description: 'Tercio', quantity: '1', unitPrice: '9.6', taxRate: '21', packSize: '12' }]),
    ).rejects.toThrow(/formato de compra/);
  });
});
