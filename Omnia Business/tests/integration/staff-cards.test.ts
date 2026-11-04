import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { unzipSync } from 'fflate';
import forge from 'node-forge';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isDomainError, type TenantContext } from '@omnia/core';
import { createSql, type Sql } from '@omnia/db';
import { createOrganizationsService } from '@omnia/organizations';
import { createPosService, type PosTerminal } from '@omnia/pos';
import {
  createSecretBox,
  createStaffCardService,
  generateSecretKey,
  totp,
  totpStep,
  type AppleSignerConfig,
  type StaffCardService,
} from '@omnia/staff-cards';
import { DEMO_PAIRING_CODE, DEMO_PINS, DEMO_USERS, seed } from '../../scripts/seed.mjs';

/**
 * Tarjetas de empleado en el TPV, sobre el esquema real con RLS y el bar de ejemplo:
 * Lucía (propietaria) emite tarjetas, Carmen (encargada) e Iván/Marta (camareros) cobran.
 */

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let pos: ReturnType<typeof createPosService>;
let cards: StaffCardService;
let token: string;
let terminal: PosTerminal;
let lucia: TenantContext;
let carmen: TenantContext;
let marta: TenantContext;
let ivan: TenantContext;
let barId: string;
const box = createSecretBox(generateSecretKey());

function testAppleConfig(): AppleSignerConfig {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  cert.setSubject([{ name: 'commonName', value: 'test' }]);
  cert.setIssuer([{ name: 'commonName', value: 'test' }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const pem = forge.pki.certificateToPem(cert);
  return {
    passTypeIdentifier: 'pass.com.omnia.test', teamIdentifier: 'TEAM', certificatePem: pem,
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey), wwdrPem: pem, webServiceUrl: 'https://omnia.example/api/wallet/apple',
  };
}

beforeAll(async () => {
  db = new PGlite();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && !f.includes('_supabase')).sort()) {
    await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  }
  await seed(db);
  const port = 45_000 + Math.floor(Math.random() * 5_000);
  server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();
  process.env.DATABASE_POOL_MAX = '1';
  sql = createSql(`postgres://postgres@127.0.0.1:${port}/postgres`);
  pos = createPosService(sql);
  cards = createStaffCardService(sql, {
    box,
    verifyHolderPin: (t, userId, pin) => pos.verifyPin(t, userId, pin),
    apple: { config: testAppleConfig(), images: { 'icon.png': Buffer.from('png') } },
    google: null,
  });

  const orgs = createOrganizationsService(sql);
  barId = (await orgs.memberships(DEMO_USERS.carmen.id)).find((m) => m.slug === 'bar-la-plaza')!.organizationId;
  const ctx = (id: string): TenantContext => ({ userId: id, organizationIds: [barId] });
  lucia = ctx(DEMO_USERS.lucia.id);
  carmen = ctx(DEMO_USERS.carmen.id);
  marta = ctx(DEMO_USERS.marta.id);
  ivan = ctx(DEMO_USERS.ivan.id);
  token = await pos.pair(DEMO_PAIRING_CODE);
  terminal = (await pos.terminal(token))!;

  const waiterRole = (await db.query<{ id: string }>(`select id from roles where organization_id = $1 and key = 'waiter'`, [barId])).rows[0]!.id;
  // General: 10 %. Camareros: 20 %, 3 usos al día y 15 € al mes, con PIN y sin autoservicio.
  await cards.savePolicy(lucia, { roleId: null, discountPct: 10, maxUsesPerDay: null, monthlyDiscountCap: null });
  await cards.savePolicy(lucia, { roleId: waiterRole, discountPct: 20, maxUsesPerDay: 3, monthlyDiscountCap: 15 });
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

const tpv = { get terminalId() { return terminal.terminalId; }, get token() { return token; } };
const product = async (name: string) => (await pos.menu(marta, terminal.warehouseId)).products.find((p) => p.name === name)!;
const newTab = async (operator: TenantContext, canas = 2) => {
  const tabId = await pos.openTab(operator, terminal, { label: `Personal ${randomUUID().slice(0, 6)}` });
  await pos.setLineQuantity(operator, terminal, { lineId: randomUUID(), tabId, itemId: (await product('Caña')).itemId, quantity: canas });
  return tabId;
};
const appleQr = async (cardId: string) => {
  const files = unzipSync(await cards.applePass(lucia, cardId));
  return JSON.parse(Buffer.from(files['pass.json']!).toString()).barcodes[0].message as string;
};
const googleQr = async (cardId: string, step = totpStep()) => {
  const { rows } = await db.query<{ secret_enc: Uint8Array }>('select secret_enc from employee_cards where id = $1', [cardId]);
  return `OMN1:${cardId}:${totp(box.open(Buffer.from(rows[0]!.secret_enc)), step)}`;
};
const reason = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (isDomainError(error)) return String(error.details?.reason ?? error.code);
    throw error;
  }
};

let martaApple: string;
let ivanGoogle: string;

describe('emisión', () => {
  it('solo quien gestiona tarjetas las emite; un camarero no', async () => {
    martaApple = (await cards.issue(lucia, { userId: DEMO_USERS.marta.id, wallet: 'apple' })).cardId;
    ivanGoogle = (await cards.issue(lucia, { userId: DEMO_USERS.ivan.id, wallet: 'google' })).cardId;
    expect(await reason(cards.issue(marta, { userId: DEMO_USERS.marta.id, wallet: 'apple' }))).toBe('FORBIDDEN');
  });

  it('la base no deja leer el secreto ni al responsable', async () => {
    const { rows } = await db.query<{ ok: boolean }>(`select has_column_privilege('app_user', 'public.employee_cards', 'secret_enc', 'select') as ok`);
    expect(rows[0]!.ok).toBe(false);
  });

  it('el titular descarga su propio pase; otro camarero no', async () => {
    expect((await cards.applePass(marta, martaApple)).length).toBeGreaterThan(100);
    expect(await reason(cards.applePass(ivan, martaApple))).toBe('NOT_FOUND');
  });
});

describe('validación en el TPV', () => {
  it('Apple: pide el PIN, rechaza el incorrecto y aplica el 20 % con el bueno', async () => {
    const tabId = await newTab(carmen);
    const qr = await appleQr(martaApple);
    expect(await cards.validateQr(carmen, tpv, { tabId, qr })).toEqual({ status: 'pin_required', holder: { name: expect.any(String), role: 'Camarero' } });
    expect(await reason(cards.validateQr(carmen, tpv, { tabId, qr, pin: '9999' }))).toBe('PIN_WRONG');

    const ok = await cards.validateQr(carmen, tpv, { tabId, qr, pin: DEMO_PINS.marta });
    expect(ok).toMatchObject({ status: 'applied', discount: { percent: '20.00', scope: 'tab' }, limits: { usesToday: 1, maxUsesPerDay: 3, monthlyCap: '15.00' } });
    const tab = await pos.tab(carmen, tabId);
    expect(tab.lines.every((l) => l.discountPct === '20.00')).toBe(true);

    // Repetir la lectura en la misma cuenta no cuenta otro uso.
    expect(await cards.validateQr(carmen, tpv, { tabId, qr, pin: DEMO_PINS.marta })).toMatchObject({ alreadyApplied: true });
  });

  it('lo que un camarero añade después también lleva el descuento (sin ser encargado)', async () => {
    const tabId = await newTab(ivan, 1);
    await cards.validateQr(ivan, tpv, { tabId, qr: await appleQr(martaApple), pin: DEMO_PINS.marta });
    await pos.setLineQuantity(ivan, terminal, { lineId: randomUUID(), tabId, itemId: (await product('Caña')).itemId, quantity: 2 });
    const tab = await pos.tab(ivan, tabId);
    expect(tab.lines).toHaveLength(2);
    expect(tab.lines.every((l) => l.discountPct === '20.00')).toBe(true);

    // Al cobrar, el uso queda cerrado con lo descontado de verdad.
    const paid = await pos.checkout(ivan, terminal, { tabId, method: 'card' });
    const { rows } = await db.query<{ status: string; gross: string; discount: string }>(
      `select status, gross_amount::text gross, discount_amount::text discount from discount_redemptions where tab_id = $1`, [tabId]);
    expect(rows[0]).toMatchObject({ status: 'redeemed' });
    expect((Number(rows[0]!.gross) - Number(rows[0]!.discount)).toFixed(2)).toBe(paid.total);
    expect(Number(rows[0]!.discount)).toBeGreaterThan(0);
  });

  it('nadie se aplica su propia tarjeta mientras maneja el TPV', async () => {
    const tabId = await newTab(marta);
    expect(await reason(cards.validateQr(marta, tpv, { tabId, qr: await appleQr(martaApple), pin: DEMO_PINS.marta }))).toBe('SELF_SERVICE');
  });

  it('Google: el mismo código TOTP no vale dos veces y uno viejo no vale', async () => {
    const qr = await googleQr(ivanGoogle);
    expect(await cards.validateQr(carmen, tpv, { tabId: await newTab(carmen), qr, pin: DEMO_PINS.ivan })).toMatchObject({ status: 'applied' });
    expect(await reason(cards.validateQr(carmen, tpv, { tabId: await newTab(carmen), qr, pin: DEMO_PINS.ivan }))).toBe('CODE_REUSED');
    expect(await reason(cards.validateQr(carmen, tpv, { tabId: await newTab(carmen), qr: await googleQr(ivanGoogle, totpStep() - 4), pin: DEMO_PINS.ivan }))).toBe('CARD_INVALID');
  });

  it('límite diario por persona', async () => {
    // Marta ya lleva 2 usos hoy (uno pendiente y uno cobrado); el tope son 3.
    expect(await cards.validateQr(carmen, tpv, { tabId: await newTab(carmen), qr: await appleQr(martaApple), pin: DEMO_PINS.marta })).toMatchObject({ limits: { usesToday: 3 } });
    expect(await reason(cards.validateQr(carmen, tpv, { tabId: await newTab(carmen), qr: await appleQr(martaApple), pin: DEMO_PINS.marta }))).toBe('DAILY_LIMIT');
  });

  it('quitar la tarjeta devuelve los precios y anula el uso', async () => {
    const tabId = await newTab(carmen);
    await cards.validateQr(carmen, tpv, { tabId, qr: await googleQr(ivanGoogle, totpStep() + 1), pin: DEMO_PINS.ivan });
    await cards.removeFromTab(carmen, tabId);
    expect((await pos.tab(carmen, tabId)).lines.every((l) => l.discountPct === '0.00')).toBe(true);
    const { rows } = await db.query<{ status: string }>('select status from discount_redemptions where tab_id = $1', [tabId]);
    expect(rows[0]!.status).toBe('void');
  });

  it('QR ajeno, mal formado o de una tarjeta inexistente', async () => {
    const tabId = await newTab(carmen);
    expect(await reason(cards.validateQr(carmen, tpv, { tabId, qr: 'https://example.com/promo' }))).toBe('QR_FORMAT');
    expect(await reason(cards.validateQr(carmen, tpv, { tabId, qr: `OMN1:${randomUUID()}:12345678` }))).toBe('CARD_UNKNOWN');
  });
});

describe('revocación', () => {
  it('revocar es inmediato en el TPV y deja el aviso en la cola', async () => {
    const qr = await appleQr(martaApple);
    await cards.revoke(lucia, martaApple, { reason: 'Prueba de revocación' });
    expect(await reason(cards.validateQr(carmen, tpv, { tabId: await newTab(carmen), qr, pin: DEMO_PINS.marta }))).toBe('CARD_REVOKED');
    const { rows } = await db.query<{ n: number }>('select count(*)::int n from wallet_pass_updates where card_id = $1 and processed_at is null', [martaApple]);
    expect(rows[0]!.n).toBeGreaterThan(0);
  });

  it('dar de baja a alguien revoca sus tarjetas en la misma transacción', async () => {
    await db.query(`update user_organizations set status = 'suspended' where organization_id = $1 and user_id = $2`, [barId, DEMO_USERS.ivan.id]);
    const { rows } = await db.query<{ status: string; reason: string }>('select status, revoke_reason reason from employee_cards where id = $1', [ivanGoogle]);
    expect(rows[0]).toMatchObject({ status: 'revoked', reason: 'Baja o suspensión en la empresa' });
    expect(await reason(cards.validateQr(carmen, tpv, { tabId: await newTab(carmen), qr: await googleQr(ivanGoogle, totpStep() + 1), pin: DEMO_PINS.ivan }))).toBe('CARD_REVOKED');
    await db.query(`update user_organizations set status = 'active' where organization_id = $1 and user_id = $2`, [barId, DEMO_USERS.ivan.id]);
  });

  it('una tarjeta revocada no se reactiva', async () => {
    await expect(db.query(`update employee_cards set status = 'active' where id = $1`, [martaApple])).rejects.toThrow(/no se reactiva/);
  });
});

describe('web service de Apple Wallet', () => {
  let card: string;
  let auth: string;

  it('registra el dispositivo solo con el token del pase', async () => {
    card = (await cards.issue(lucia, { userId: DEMO_USERS.marta.id, wallet: 'apple' })).cardId;
    const files = unzipSync(await cards.applePass(lucia, card));
    auth = JSON.parse(Buffer.from(files['pass.json']!).toString()).authenticationToken;
    expect(await cards.apple.register(card, 'token-falso', 'device-1', 'push-1')).toBe('unauthorized');
    expect(await cards.apple.register(card, auth, 'device-1', 'push-1')).toBe('created');
    expect(await cards.apple.register(card, auth, 'device-1', 'push-1')).toBe('exists');
  });

  it('informa de los pases cambiados y sirve la versión anulada tras revocar', async () => {
    const first = await cards.apple.updatedSerials('device-1', null);
    expect(first?.serialNumbers).toEqual([card]);
    expect(await cards.apple.updatedSerials('device-1', first!.lastUpdated)).toBeNull();

    await new Promise((r) => setTimeout(r, 5));
    await cards.revoke(lucia, card, { reason: 'Prueba' });
    expect((await cards.apple.updatedSerials('device-1', first!.lastUpdated))?.serialNumbers).toEqual([card]);

    const latest = await cards.apple.latestPass(card, auth);
    const pass = JSON.parse(Buffer.from(unzipSync(latest!.body)['pass.json']!).toString());
    expect(pass).toMatchObject({ voided: true });
    expect(pass.barcodes).toBeUndefined();
    expect(await cards.apple.latestPass(card, 'otro-token')).toBeNull();
  });

  it('la cola lleva los tokens de push del dispositivo', async () => {
    const { rows } = await db.query<{ tokens: string[] }>(
      `select push_tokens tokens from app.wallet_updates_claim(100) where card_id = $1`, [card]);
    expect(rows[0]?.tokens).toEqual(['push-1']);
  });
});
