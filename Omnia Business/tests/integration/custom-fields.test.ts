import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@omnia/core';
import { createSql, type Sql } from '@omnia/db';
import { createHrService } from '@omnia/hr';
import { createIncidentsService } from '@omnia/incidents';
import { createInvoicingService } from '@omnia/invoicing';
import { createOrganizationsService } from '@omnia/organizations';
import { createPartiesService } from '@omnia/parties';
import { DEMO_USERS, seed } from '../../scripts/seed.mjs';

// Ajustes › Campos personalizados en las fichas que no son de almacén:
// clientes/proveedores, facturas, incidencias y fichajes manuales.

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let ctx: TenantContext;
let orgs: ReturnType<typeof createOrganizationsService>;
let parties: ReturnType<typeof createPartiesService>;
let invoicing: ReturnType<typeof createInvoicingService>;
let incidents: ReturnType<typeof createIncidentsService>;
let hr: ReturnType<typeof createHrService>;
const lucia = DEMO_USERS.lucia.id;

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
  parties = createPartiesService(sql);
  invoicing = createInvoicingService(sql);
  incidents = createIncidentsService(sql);
  hr = createHrService(sql);
  const [org] = await orgs.memberships(lucia);
  ctx = { userId: lucia, organizationIds: [org!.organizationId] };

  const field = (entity: string, key: string, dataType: string, extra: object = {}) =>
    orgs.createCustomField(ctx, { entity, key, label: key, dataType, isRequired: false, options: [], ...extra });
  await field('party', 'zona', 'select', { options: ['Centro', 'Playa'], isRequired: true });
  await field('invoice', 'pedido_cliente', 'text');
  await field('incident', 'coste_estimado', 'number');
  await field('time_entry', 'autorizado', 'boolean');
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

describe('Campos personalizados', () => {
  it('cliente/proveedor: se guardan, se validan y el alta rápida no los exige', async () => {
    const base = { legalName: 'Bodegas Prueba', isCustomer: false, isSupplier: true };
    await expect(parties.save(ctx, { ...base, customFields: {} })).rejects.toThrow(/Campos personalizados no válidos/);
    await expect(parties.save(ctx, { ...base, customFields: { zona: 'Montaña' } })).rejects.toThrow(/no válidos/);

    const id = await parties.save(ctx, { ...base, customFields: { zona: 'Playa' } });
    expect((await parties.get(ctx, id)).customFields).toEqual({ zona: 'Playa' });

    // Editar sin enviarlos (otro formulario) no los borra.
    await parties.save(ctx, { ...base, legalName: 'Bodegas Prueba SL' }, id);
    expect((await parties.get(ctx, id)).customFields).toEqual({ zona: 'Playa' });

    // Alta rápida (p. ej. desde una factura escaneada): sin campos, aunque haya uno obligatorio.
    const quick = await parties.save(ctx, { legalName: 'Proveedor Rápido', isCustomer: false, isSupplier: true });
    expect((await parties.get(ctx, quick)).customFields).toEqual({});
  });

  it('factura: se guarda en el borrador y se ve en la ficha', async () => {
    const [customer] = await parties.list(ctx, { role: 'customer' });
    const id = await invoicing.saveDraft(ctx, {
      direction: 'issued',
      partyId: customer!.id,
      customFields: { pedido_cliente: 'PO-7781' },
      lines: [{ description: 'Servicio', quantity: '1', unitPrice: '100', taxRate: '21' }],
    });
    expect((await invoicing.get(ctx, id)).customFields).toEqual({ pedido_cliente: 'PO-7781' });
    await expect(
      invoicing.saveDraft(ctx, { direction: 'issued', partyId: customer!.id, customFields: { otra: 1 }, lines: [{ description: 'x', quantity: '1', unitPrice: '1', taxRate: '21' }] }),
    ).rejects.toThrow(/no válidos/);
  });

  it('incidencia: se guarda al abrirla', async () => {
    const id = await incidents.create(ctx, { title: 'Cámara averiada', customFields: { coste_estimado: 350 } });
    expect((await incidents.get(ctx, id)).customFields).toEqual({ coste_estimado: 350 });
    await expect(incidents.create(ctx, { title: 'Otra avería', customFields: { coste_estimado: 'mucho' } })).rejects.toThrow(/no válidos/);
  });

  it('fichaje manual: se guarda y aparece en el registro del día', async () => {
    await hr.manualEntry(ctx, {
      userId: lucia,
      entryType: 'clock_in',
      occurredAt: '2026-11-02T08:00:00Z',
      correctionReason: 'Olvidó fichar',
      customFields: { autorizado: true },
    });
    const [row] = await hr.day(ctx, '2026-11-02', 'self');
    expect(row!.entries.find((e) => e.source === 'manual')!.customFields).toEqual({ autorizado: true });
  });
});
