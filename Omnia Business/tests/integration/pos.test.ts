import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@omnia/core';
import { createSql, type Sql } from '@omnia/db';
import { createOrganizationsService } from '@omnia/organizations';
import { createPosService, type PosTerminal } from '@omnia/pos';
import { createRecipeService } from '@omnia/recipes';
// El mismo sembrado que `npm run db:dev`: el bar de ejemplo con su carta y escandallos.
import { DEMO_PAIRING_CODE, DEMO_PINS, DEMO_USERS, seed } from '../../scripts/seed.mjs';

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let pos: ReturnType<typeof createPosService>;
let recipes: ReturnType<typeof createRecipeService>;
let token: string;
let terminal: PosTerminal;
let marta: TenantContext; // camarera
let carmen: TenantContext; // encargada

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
  pos = createPosService(sql);
  recipes = createRecipeService(sql);

  const orgs = createOrganizationsService(sql);
  const bar = (await orgs.memberships(DEMO_USERS.carmen.id)).find((m) => m.slug === 'bar-la-plaza')!.organizationId;
  marta = { userId: DEMO_USERS.marta.id, organizationIds: [bar] };
  carmen = { userId: DEMO_USERS.carmen.id, organizationIds: [bar] };
  token = await pos.pair(DEMO_PAIRING_CODE);
  terminal = (await pos.terminal(token))!;
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

const product = async (name: string) => (await pos.menu(marta, terminal.warehouseId)).products.find((p) => p.name === name)!;
const stockOf = async (name: string) => (await recipes.ingredients(carmen, terminal.warehouseId)).find((i) => i.name === name)!;
const freeTable = async () => (await pos.floor(marta)).tables.find((t) => !t.tab)!;

describe('Terminal y PIN', () => {
  it('el código de vinculación sirve una sola vez', async () => {
    expect(terminal.orgSlug).toBe('bar-la-plaza');
    await expect(pos.pair(DEMO_PAIRING_CODE)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('comprueba el PIN y bloquea tras cinco fallos', async () => {
    expect(await pos.verifyPin(token, DEMO_USERS.marta.id, DEMO_PINS.marta)).toEqual({ ok: true });
    expect(await pos.verifyPin(token, DEMO_USERS.marta.id, '9999')).toMatchObject({ ok: false, reason: 'wrong' });
    for (let i = 0; i < 4; i++) await pos.verifyPin(token, DEMO_USERS.ivan.id, '0000');
    expect(await pos.verifyPin(token, DEMO_USERS.ivan.id, '0000')).toMatchObject({ ok: false, reason: 'locked' });
    // Bloqueado: ni el PIN bueno entra.
    expect(await pos.verifyPin(token, DEMO_USERS.ivan.id, DEMO_PINS.ivan)).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('la camarera ve si la caja está abierta (sin acceso a la tabla de terminales)', async () => {
    expect((await pos.cashSession(marta, terminal.terminalId))?.status).toBe('open');
  });

  it('un token desconocido no resuelve terminal', async () => {
    expect(await pos.terminal('no-existe')).toBeNull();
  });
});

describe('Cuenta y cobro', () => {
  it('tres cañas cuadran con la carta, descuentan el barril y el cobro es idempotente', async () => {
    const cana = await product('Caña');
    const barrilBefore = Number((await stockOf('Cerveza de barril')).onHand);
    const tabId = await pos.openTab(marta, terminal, { tableId: (await freeTable()).id, guests: 3 });
    const lineId = randomUUID();
    await pos.setLineQuantity(marta, terminal, { lineId, tabId, itemId: cana.itemId, quantity: 1 });
    await pos.setLineQuantity(marta, terminal, { lineId, tabId, itemId: cana.itemId, quantity: 3 });
    await pos.setLineQuantity(marta, terminal, { lineId, tabId, itemId: cana.itemId, quantity: 3 }); // reintento
    const tab = await pos.tab(marta, tabId);
    expect(tab.lines).toHaveLength(1);
    expect(tab.totals.total).toBe('6.60');

    const paid = await pos.checkout(marta, terminal, { tabId, method: 'cash', tendered: '10' });
    expect(paid).toMatchObject({ total: '6.60', change: '3.40' });
    expect(paid.fullNumber).toMatch(/^T-\d{4}-\d{6}$/);
    expect(Number((await stockOf('Cerveza de barril')).onHand)).toBeCloseTo(barrilBefore - 0.6, 4);

    const again = await pos.checkout(marta, terminal, { tabId, method: 'cash', tendered: '10' });
    expect(again.invoiceId).toBe(paid.invoiceId);
    expect(Number((await stockOf('Cerveza de barril')).onHand)).toBeCloseTo(barrilBefore - 0.6, 4);
  });

  it('el ticket impreso lleva el desglose de IVA', async () => {
    const [last] = await pos.recentTickets(marta, terminal.terminalId);
    const ticket = await pos.ticket(marta, last!.invoiceId);
    expect(ticket.issuer.taxId).toBe('B47998811');
    expect(ticket.taxes).toEqual([{ rate: '10.00', base: expect.any(String), tax: expect.any(String) }]);
    expect(ticket.verifactu).toBe(true);
  });

  it('sin sistema fiscal el ticket es una simplificada sin QR ni envío', async () => {
    const [bar] = marta.organizationIds;
    await db.query(`update organizations set fiscal_regime = 'none' where id = $1`, [bar]);
    try {
      const tabId = await pos.openTab(marta, terminal, { label: 'Sin VeriFactu', guests: 1 });
      await pos.setLineQuantity(marta, terminal, { lineId: randomUUID(), tabId, itemId: (await product('Caña')).itemId, quantity: 1 });
      const paid = await pos.checkout(marta, terminal, { tabId, method: 'card' });
      expect((await pos.ticket(marta, paid.invoiceId)).verifactu).toBe(false);
      const [{ fiscal_status }] = (await db.query<{ fiscal_status: string }>(`select fiscal_status from invoices where id = $1`, [paid.invoiceId])).rows;
      expect(fiscal_status).toBe('not_applicable');
    } finally {
      await db.query(`update organizations set fiscal_regime = 'verifactu' where id = $1`, [bar]);
    }
  });

  it('el ajuste «tickets sin VeriFactu» saca solo los tickets del TPV de la cadena registrada', async () => {
    const [bar] = marta.organizationIds;
    const cobrar = async () => {
      const tabId = await pos.openTab(marta, terminal, { label: 'Ticket', guests: 1 });
      await pos.setLineQuantity(marta, terminal, { lineId: randomUUID(), tabId, itemId: (await product('Caña')).itemId, quantity: 1 });
      const { invoiceId } = await pos.checkout(marta, terminal, { tabId, method: 'card' });
      const [row] = (await db.query<{ fiscal_status: string; fiscal_record_hash: string; fiscal_previous_hash: string | null }>(
        `select fiscal_status, fiscal_record_hash, fiscal_previous_hash from invoices where id = $1`, [invoiceId])).rows;
      return { invoiceId, ...row! };
    };
    const antes = await cobrar();
    await db.query(`update organizations set settings = settings || '{"pos_tickets_verifactu": false}' where id = $1`, [bar]);
    try {
      expect((await pos.settings(carmen)).ticketsVerifactu).toBe(false);
      const fuera = await cobrar();
      expect(fuera.fiscal_record_hash).toBeTruthy();
      expect(fuera.fiscal_status).toBe('not_applicable');
      expect((await pos.ticket(marta, fuera.invoiceId)).verifactu).toBe(false);
    } finally {
      await db.query(`update organizations set settings = settings || '{"pos_tickets_verifactu": true}' where id = $1`, [bar]);
    }

    // El siguiente ticket registrado encadena con el último registrado, no con el de fuera
    // (aunque los tres se emitan en el mismo segundo).
    const despues = await cobrar();
    expect(despues.fiscal_status).toBe('pending');
    expect(despues.fiscal_previous_hash).toBe(antes.fiscal_record_hash);
  });

  it('si el efectivo no llega no se emite nada', async () => {
    const tabId = await pos.openTab(marta, terminal, { label: 'Prueba', guests: 1 });
    await pos.setLineQuantity(marta, terminal, { lineId: randomUUID(), tabId, itemId: (await product('Gin-tonic')).itemId, quantity: 1 });
    await expect(pos.checkout(marta, terminal, { tabId, method: 'cash', tendered: '5' })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await pos.tab(marta, tabId)).status).toBe('open');
  });

  it('la camarera no aplica descuentos ni anula; la encargada sí', async () => {
    const tabId = await pos.openTab(marta, terminal, { label: 'Descuento', guests: 1 });
    const lineId = randomUUID();
    await pos.setLineQuantity(marta, terminal, { lineId, tabId, itemId: (await product('Mojito')).itemId, quantity: 1 });
    await expect(pos.setLineDiscount(marta, lineId, '100')).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(pos.cancelTab(marta, tabId, 'error')).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await pos.setLineDiscount(carmen, lineId, '100');
    expect((await pos.tab(carmen, tabId)).totals.total).toBe('0.00');
    await pos.cancelTab(carmen, tabId, 'Invitación anulada');
  });

  it('dividir el ticket cobra solo lo elegido y deja el resto en la mesa', async () => {
    const table = await freeTable();
    const tabId = await pos.openTab(marta, terminal, { tableId: table.id, guests: 2 });
    const canas = randomUUID();
    const gin = randomUUID();
    await pos.setLineQuantity(marta, terminal, { lineId: canas, tabId, itemId: (await product('Caña')).itemId, quantity: 3 });
    await pos.setLineQuantity(marta, terminal, { lineId: gin, tabId, itemId: (await product('Gin-tonic')).itemId, quantity: 1 });
    await pos.sendToKitchen(marta, tabId);
    const before = await pos.tab(marta, tabId);

    // La camarera divide aunque ya esté en cocina: no se quita nada, se cobra aparte.
    const splitId = randomUUID();
    const items = [{ lineId: canas, quantity: 1 }, { lineId: gin, quantity: 1 }];
    const paid = await pos.checkoutSplit(marta, terminal, { tabId, splitId, items, method: 'card' });
    expect(paid.tabId).toBe(splitId);

    const rest = await pos.tab(marta, tabId);
    expect(rest.status).toBe('open');
    expect(rest.table?.id).toBe(table.id);
    expect(rest.lines.map((l) => [l.id, Number(l.quantity)])).toEqual([[canas, 2]]);
    expect((Number(paid.total) + Number(rest.totals.total)).toFixed(2)).toBe(before.totals.total);
    expect((await pos.ticket(marta, paid.invoiceId)).tableName).toBe(table.name);

    // Reintento tras un corte: mismo ticket, nada más se mueve.
    const again = await pos.checkoutSplit(marta, terminal, { tabId, splitId, items, method: 'card' });
    expect(again.invoiceId).toBe(paid.invoiceId);
    expect((await pos.tab(marta, tabId)).lines.map((l) => Number(l.quantity))).toEqual([2]);

    // Más unidades de las que hay: no se divide ni se cobra nada.
    await expect(
      pos.checkoutSplit(marta, terminal, { tabId, splitId: randomUUID(), items: [{ lineId: canas, quantity: 5 }], method: 'card' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect((await pos.tab(marta, tabId)).lines.map((l) => Number(l.quantity))).toEqual([2]);

    // Fuera de la división, quitar lo enviado a cocina sigue siendo cosa de encargado.
    await expect(pos.setLineQuantity(marta, terminal, { lineId: canas, tabId, itemId: (await product('Caña')).itemId, quantity: 1 })).rejects.toMatchObject({ code: 'INVALID_STATE' });

    await pos.checkout(marta, terminal, { tabId, method: 'cash' });
  });

  it('el precio lo pone la carta, no el terminal', async () => {
    const tabId = await pos.openTab(marta, terminal, { label: 'Precio', guests: 1 });
    await expect(
      pos.setLineQuantity(marta, terminal, { lineId: randomUUID(), tabId, itemId: (await stockOf('Ginebra')).id, quantity: 1 }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('Escandallos', () => {
  it('calcula coste y food cost con el coste medio de los ingredientes', async () => {
    const gin = (await recipes.products(carmen, terminal.warehouseId)).find((p) => p.name === 'Gin-tonic')!;
    // 0,05 l × 14,50 + 1 × 0,55 + 0,25 × 0,25 + 0,15 × 0,35
    expect(Number(gin.unitCost)).toBeCloseTo(0.725 + 0.55 + 0.0625 + 0.0525, 4);
    expect(gin.hasRecipe).toBe(true);
  });

  it('guardar la ficha la sustituye entera', async () => {
    const vodka = (await recipes.products(carmen, terminal.warehouseId)).find((p) => p.name === 'Vodka con tónica')!;
    const ton = await stockOf('Tónica (botellín)');
    await recipes.save(carmen, { productId: vodka.id, lines: [{ ingredientId: ton.id, quantity: '1' }] });
    const detail = await recipes.get(carmen, vodka.id, terminal.warehouseId);
    expect(detail.lines.map((l) => l.name)).toEqual(['Tónica (botellín)']);
  });
});

describe('Caja', () => {
  it('no cierra con cuentas abiertas y, cerrada, cuadra con lo contado', async () => {
    const session = (await pos.cashSession(carmen, terminal.terminalId))!;
    await expect(pos.closeCash(carmen, session.id, { counted: '0' })).rejects.toMatchObject({ code: 'INVALID_STATE' });

    const floor = await pos.floor(carmen);
    for (const t of [...floor.tables.flatMap((x) => (x.tab ? [x.tab] : [])), ...floor.counterTabs]) await pos.cancelTab(carmen, t.id, 'cierre de prueba');
    const live = (await pos.cashSession(carmen, terminal.terminalId))!.summary;
    const closed = await pos.closeCash(carmen, session.id, { counted: live.expectedCash, detail: { '5000': 2 } });
    expect(closed.status).toBe('closed');
    expect(closed.difference).toBe('0.00');
    expect(closed.summary.tickets).toBe(live.tickets);
    expect(await pos.cashSession(carmen, terminal.terminalId)).toBeNull();
  });

  it('sin caja abierta no se cobra', async () => {
    const tabId = await pos.openTab(marta, terminal, { label: 'Sin caja', guests: 1 });
    await pos.setLineQuantity(marta, terminal, { lineId: randomUUID(), tabId, itemId: (await product('Café solo')).itemId, quantity: 1 });
    await expect(pos.checkout(marta, terminal, { tabId, method: 'card' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('la camarera no abre la caja', async () => {
    await expect(pos.openCash(marta, terminal.terminalId, '100')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// Al final: deja el token de la tablet sin valor.
describe('Desvincular desde la tablet', () => {
  it('revoca el terminal y permite vincular la tablet con otro código', async () => {
    await pos.unpair(token);
    expect(await pos.terminal(token)).toBeNull();
    expect(await pos.staff(token)).toEqual([]);
    expect((await pos.terminals(carmen)).find((t) => t.id === terminal.terminalId)?.revokedAt).toBeInstanceOf(Date);

    const { code } = await pos.newPairingCode(carmen, terminal.terminalId);
    const fresh = await pos.pair(code);
    expect((await pos.terminal(fresh))?.terminalId).toBe(terminal.terminalId);
  });
});

describe('Nombre del cliente y comanda', () => {
  it('la mesa se abre con el nombre del cliente y la comanda lleva mesa, cliente y solo lo de cada envío', async () => {
    const table = await freeTable();
    const tabId = await pos.openTab(marta, terminal, { tableId: table.id, customerName: '  Laura  ', guests: 2 });
    const tab = await pos.tab(marta, tabId);
    expect(tab.customerName).toBe('Laura');
    expect((await pos.floor(marta)).tables.find((t) => t.id === table.id)?.tab?.customerName).toBe('Laura');

    await pos.setLineQuantity(marta, terminal, { lineId: randomUUID(), tabId, itemId: (await product('Caña')).itemId, quantity: 2 });
    const first = await pos.sendToKitchen(marta, tabId);
    expect(first.lines).toBe(1);
    expect(first.sentAt).not.toBeNull();

    const gin = randomUUID();
    await pos.setLineQuantity(marta, terminal, { lineId: gin, tabId, itemId: (await product('Gin-tonic')).itemId, quantity: 1 });
    await pos.setLineNote(marta, gin, 'Sin hielo');
    const second = await pos.sendToKitchen(marta, tabId);

    const ticket = await pos.kitchenTicket(marta, tabId, second.sentAt);
    expect(ticket.tableName).toBe(table.name);
    expect(ticket.customerName).toBe('Laura');
    expect(ticket.lines).toEqual([{ description: 'Gin-tonic', quantity: '1.0000', note: 'Sin hielo' }]);
    expect((await pos.kitchenTicket(marta, tabId, first.sentAt)).lines.map((l) => l.description)).toEqual(['Caña']);
    // Sin envío indicado, el último.
    expect((await pos.kitchenTicket(marta, tabId)).lines.map((l) => l.description)).toEqual(['Gin-tonic']);
    // Sin nada pendiente, no hay comanda nueva.
    expect(await pos.sendToKitchen(marta, tabId)).toEqual({ lines: 0, sentAt: null });

    await pos.setCustomerName(marta, tabId, '');
    expect((await pos.tab(marta, tabId)).customerName).toBeNull();
    await pos.cancelTab(carmen, tabId, 'Prueba de comanda');
  });

  it('dejar el nombre en blanco abre la mesa sin nombre', async () => {
    const tabId = await pos.openTab(marta, terminal, { tableId: (await freeTable()).id, customerName: '   ', guests: 2 });
    expect((await pos.tab(marta, tabId)).customerName).toBeNull();
    await pos.cancelTab(marta, tabId, 'Vacía');
  });
});
