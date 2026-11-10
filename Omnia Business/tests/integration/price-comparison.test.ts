import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@omnia/core';
import { createSql, type Sql } from '@omnia/db';
import { createInvoicingService } from '@omnia/invoicing';
import { createOrganizationsService } from '@omnia/organizations';
import { createPurchasingService } from '@omnia/purchasing';
import { DEMO_USERS, seed } from '../../scripts/seed.mjs';

/**
 * Comparador de precios de compra sobre el esquema real: cada factura recibida
 * se compara, precio por unidad, con la última factura del mismo proveedor.
 */

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let purchasing: ReturnType<typeof createPurchasingService>;
let invoicing: ReturnType<typeof createInvoicingService>;
let lucia: TenantContext;
let supplierId: string;
let previousId: string;
let items: Record<string, string>;

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
  purchasing = createPurchasingService(sql);
  invoicing = createInvoicingService(sql);

  const memberships = await createOrganizationsService(sql).memberships(DEMO_USERS.lucia.id);
  const orgId = memberships.find((m) => m.slug === 'distribuciones-albar')!.organizationId;
  lucia = { userId: DEMO_USERS.lucia.id, organizationIds: [orgId] };

  // Datos de ejemplo: TN-F-2026-1188 de Cervezas del Norte (tercio a 9,60 €, cola a 8,40 € la caja) y antes TN-F-2026-1094.
  const prev = await db.query<{ id: string; party_id: string }>(`select id, party_id from invoices where full_number = 'TN-F-2026-1188'`);
  previousId = prev.rows[0]!.id;
  supplierId = prev.rows[0]!.party_id;
  const rows = await db.query<{ sku: string; id: string }>(`select sku, id from inventory_items where organization_id = $1`, [orgId]);
  items = Object.fromEntries(rows.rows.map((r) => [r.sku, r.id]));
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

const line = (sku: string | null, description: string, quantity: string, unitPrice: string) => ({
  ...(sku ? { itemId: items[sku] } : {}),
  description,
  quantity,
  unitPrice,
  discountPct: '0',
  taxRate: '10',
});

const register = async (supplierNumber: string, issueDate: string, lines: ReturnType<typeof line>[]) => {
  const warehouseId = (await db.query<{ id: string }>(`select id from warehouses where organization_id = $1 order by name limit 1`, [lucia.organizationIds[0]])).rows[0]!.id;
  return invoicing.createDraft(lucia, { direction: 'received', partyId: supplierId, supplierNumber, issueDate, warehouseId, lines });
};

describe('comparador de precios', () => {
  it('compara las dos últimas facturas de los datos de ejemplo', async () => {
    const r = await purchasing.compareLatestInvoices(lucia, supplierId);
    expect(r.latest?.id).toBe(previousId);
    expect(r.comparison?.previous?.fullNumber).toBe('TN-F-2026-1094');
    expect(r.comparison?.rows.map((x) => [x.previousPrice, x.price, x.trend])).toEqual([
      ['9.85', '9.6', 'down'],
      ['8.1', '8.4', 'up'],
    ]);
  });

  it('con una sola factura no hay nada que comparar', async () => {
    const [other] = (await purchasing.suppliersWithInvoices(lucia)).filter((s) => s.invoiceCount === 1);
    const r = await purchasing.compareLatestInvoices(lucia, other!.id);
    expect(r.latest).not.toBeNull();
    expect(r.comparison).toBeNull();
  });

  it('compara la última factura del proveedor con la penúltima, precio por unidad', async () => {
    const id = await register('TN-F-2026-1302', '2026-11-05', [
      // 100 cajas en vez de 300, mismo precio por caja: no es una bajada.
      line('CER-TER', 'Cerveza tercio 33 cl caja 24', '100', '9.6'),
      line('REF-COLA', 'Refresco cola lata 33cl caja 24', '1', '8.9'),
      line(null, 'Agua mineral 50 cl caja 24', '20', '4.2'),
    ]);

    const r = await purchasing.compareLatestInvoices(lucia, supplierId);
    expect(r.latest).toMatchObject({ id, fullNumber: 'TN-F-2026-1302' });
    expect(r.comparison?.previous).toMatchObject({ id: previousId, fullNumber: 'TN-F-2026-1188' });
    expect(r.comparison?.rows.map((x) => [x.description, x.previousPrice, x.price, x.trend])).toEqual([
      ['Cerveza tercio 33 cl caja 24', '9.6', '9.6', 'same'],
      ['Refresco cola lata 33cl caja 24', '8.4', '8.9', 'up'],
      ['Agua mineral 50 cl caja 24', null, '4.2', 'new'],
    ]);
    expect(r.comparison?.rows[1]).toMatchObject({ diff: '0.5', diffPct: 6 });

    // La ficha de la factura enseña la misma comparación.
    expect((await purchasing.invoicePriceComparison(lucia, id))?.counts).toEqual({ up: 1, down: 0, same: 1, new: 1 });
    expect((await purchasing.invoicePriceComparison(lucia, previousId))?.previous?.fullNumber).toBe('TN-F-2026-1094');
  });

  it('al registrar otra, compara esa con la anterior (la última y la penúltima van corriendo)', async () => {
    await register('TN-F-2026-1400', '2026-12-01', [line('REF-COLA', 'Refresco de cola lata 33 cl (caja 24)', '5', '8.5')]);
    const r = await purchasing.compareLatestInvoices(lucia, supplierId);
    expect(r.latest?.fullNumber).toBe('TN-F-2026-1400');
    expect(r.comparison?.previous?.fullNumber).toBe('TN-F-2026-1302');
    expect(r.comparison?.rows[0]).toMatchObject({ trend: 'down', previousPrice: '8.9', price: '8.5', diffPct: -4.5 });
    expect(r.comparison?.missing.map((m) => m.description)).toEqual(['Cerveza tercio 33 cl caja 24', 'Agua mineral 50 cl caja 24']);

    const suppliers = await purchasing.suppliersWithInvoices(lucia);
    expect(suppliers.find((s) => s.id === supplierId)).toMatchObject({ invoiceCount: 4, lastDate: '2026-12-01' });
  });
});
