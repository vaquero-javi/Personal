import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@omnia/core';
import { createSql, type Sql } from '@omnia/db';
import { createHrService } from '@omnia/hr';
import { createIncidentsService } from '@omnia/incidents';
import { createGoodsReceiptService, createPostgresInventoryUnitOfWork, createWarehouseService } from '@omnia/inventory';
import { createInvoicingService } from '@omnia/invoicing';
import { createOrganizationsService } from '@omnia/organizations';
import { createPurchasingService } from '@omnia/purchasing';
import { createSalesService } from '@omnia/sales';
// El mismo sembrado que `npm run db:dev`: los servicios se prueban sobre datos realistas.
import { DEMO_USERS, seed } from '../../scripts/seed.mjs';

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let services: ReturnType<typeof build>;
let lucia: TenantContext;
let marta: TenantContext;

function build(sql: Sql) {
  return {
    organizations: createOrganizationsService(sql),
    warehouse: createWarehouseService(sql),
    receipts: createGoodsReceiptService(createPostgresInventoryUnitOfWork(sql)),
    purchasing: createPurchasingService(sql),
    sales: createSalesService(sql),
    invoicing: createInvoicingService(sql),
    hr: createHrService(sql),
    incidents: createIncidentsService(sql),
  };
}

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
  services = build(sql);

  const orgOf = async (userId: string) => {
    const memberships = await services.organizations.memberships(userId);
    return memberships.find((m) => m.slug === 'distribuciones-albar')!.organizationId;
  };
  lucia = { userId: DEMO_USERS.lucia.id, organizationIds: [await orgOf(DEMO_USERS.lucia.id)] };
  marta = { userId: DEMO_USERS.marta.id, organizationIds: [await orgOf(DEMO_USERS.marta.id)] };
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

const centralWarehouse = async () => (await services.warehouse.warehouses(lucia)).find((w) => w.code === 'CEN')!.id;
const itemBySku = async (sku: string) => (await services.warehouse.items(lucia, { search: sku }))[0]!;

describe('TPV', () => {
  it('emite un ticket F2 encadenado, descuenta stock y registra el cobro', async () => {
    const warehouseId = await centralWarehouse();
    const before = await itemBySku('SL-300');
    const ticket = await services.sales.posCheckout(lucia, {
      warehouseId,
      method: 'cash',
      tendered: '20',
      lines: [{ itemId: before.id, quantity: '2' }],
    });
    expect(ticket.fullNumber).toMatch(/^T-\d{4}-000001$/);
    expect(Number(ticket.total)).toBeCloseTo(2 * 4.95 * 1.21, 2);
    expect(Number(ticket.change)).toBeCloseTo(20 - Number(ticket.total), 2);

    const after = await itemBySku('SL-300');
    expect(Number(after.onHand)).toBe(Number(before.onHand) - 2);
    const invoice = await services.invoicing.get(lucia, ticket.invoiceId);
    expect(invoice.status).toBe('paid');
    expect(invoice.fiscalRecordHash).toMatch(/^[0-9A-F]{64}$/);
    expect(invoice.fiscalPreviousHash).not.toBeNull(); // encadenado a la última factura de la sociedad
  });

  it('no cobra si el efectivo no cubre el total, y no deja rastro', async () => {
    const warehouseId = await centralWarehouse();
    const item = await itemBySku('GU-NI');
    await expect(
      services.sales.posCheckout(lucia, { warehouseId, method: 'cash', tendered: '1', lines: [{ itemId: item.id, quantity: '1' }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(Number((await itemBySku('GU-NI')).onHand)).toBe(Number(item.onHand));
  });
});

describe('Pedidos de venta', () => {
  it('no se sirve sin existencias: la transacción entera se deshace', async () => {
    const warehouseId = await centralWarehouse();
    const customers = await sql`select id from parties where is_customer limit 1`;
    const item = await itemBySku('CN-CU25');
    const id = await services.sales.create(lucia, {
      customerId: customers[0]!.id,
      warehouseId,
      lines: [{ itemId: item.id, description: item.name, quantity: '100000', unitPrice: '6.5', taxRate: '21' }],
    });
    await services.sales.confirm(lucia, id);
    await expect(services.sales.deliver(lucia, id)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect((await services.sales.get(lucia, id)).status).toBe('confirmed');
  });
});

describe('Compras', () => {
  it('recibir un pedido enviado y contabilizar el albarán lo marca como recibido', async () => {
    const [sent] = await services.purchasing.list(lucia, { status: 'sent' });
    const receiptId = await services.purchasing.receive(lucia, sent!.id, 'AL-TEST-1');
    await services.receipts.post(lucia, receiptId);
    const po = await services.purchasing.get(lucia, sent!.id);
    expect(po.status).toBe('received');
    expect(po.receivedPct).toBe(100);
  });
});

describe('Fichajes', () => {
  it('respeta la secuencia entrada → pausa → vuelta → salida', async () => {
    await expect(services.hr.clock(marta, { entryType: 'clock_out' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await services.hr.clock(marta, { entryType: 'clock_in' });
    await expect(services.hr.clock(marta, { entryType: 'clock_in' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await services.hr.clock(marta, { entryType: 'break_start' });
    await services.hr.clock(marta, { entryType: 'break_end' });
    await services.hr.clock(marta, { entryType: 'clock_out' });
    expect((await services.hr.myDay(marta)).state).toBe('out');
  });

  it('exige consentimiento para guardar la ubicación', async () => {
    await expect(services.hr.clock(lucia, { entryType: 'clock_in', latitude: 41.65, longitude: -4.72, geoConsent: false })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });
});

describe('Permisos (RLS)', () => {
  it('una empleada no ve facturas ni puede crearlas', async () => {
    expect(await services.invoicing.list(marta)).toHaveLength(0);
    const customers = await sql`select id from parties where is_customer limit 1`;
    await expect(
      services.invoicing.createDraft(marta, {
        direction: 'issued',
        partyId: customers[0]!.id,
        lines: [{ description: 'x', quantity: '1', unitPrice: '1', taxRate: '21' }],
      }),
    ).rejects.toThrow();
  });

  it('una empleada abre incidencias pero no reasigna las ajenas', async () => {
    const id = await services.incidents.create(marta, { title: 'Prueba de permisos' });
    const created = await services.incidents.get(marta, id);
    expect(created.reportedBy).toBe(DEMO_USERS.marta.id);
    const active = await services.incidents.list(lucia, { status: 'active' });
    const mine = active.find((i) => i.assigneeName === DEMO_USERS.marta.name)!;
    const others = active.find((i) => i.assigneeName === DEMO_USERS.ivan.name)!;
    // La suya: puede cambiar estado y prioridad (manteniéndose asignada).
    await services.incidents.update(marta, mine.id, { status: 'in_progress', priority: 'urgent', assigneeUserId: DEMO_USERS.marta.id });
    expect((await services.incidents.get(lucia, mine.id)).status).toBe('in_progress');
    // La de otro: la RLS no le deja tocarla.
    await expect(
      services.incidents.update(marta, others.id, { status: 'closed', priority: 'low', assigneeUserId: DEMO_USERS.ivan.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // Y no puede pasarle la suya a otra persona.
    await expect(
      services.incidents.update(marta, mine.id, { status: 'in_progress', priority: 'urgent', assigneeUserId: DEMO_USERS.ivan.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
