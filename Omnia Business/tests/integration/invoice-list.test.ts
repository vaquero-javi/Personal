import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isDomainError, type TenantContext } from '@omnia/core';
import { createSql, type Sql } from '@omnia/db';
import { createInvoicingService, type InvoiceListQueryInput } from '@omnia/invoicing';
import { createOrganizationsService } from '@omnia/organizations';
import { DEMO_USERS, seed } from '../../scripts/seed.mjs';

/**
 * Listado de facturas paginado por cursor sobre el esquema real, con RLS.
 * Lo importante: recorrer todas las páginas devuelve exactamente las filas del
 * filtro, en orden, sin repetir ni saltar ninguna, aunque haya empates.
 */

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let invoicing: ReturnType<typeof createInvoicingService>;
let orgA: string;
let orgB: string;
let lucia: TenantContext;
let marta: TenantContext;

/** Facturas recibidas de prueba. Desactiva triggers: solo interesa el volumen y el orden. */
async function insertReceived(organizationId: string, count: number, prefix: string) {
  await db.query(
    `insert into invoices (organization_id, direction, status, party_id, full_number, issue_date, due_date, total, paid_total, created_at)
     select $1, 'received',
            (array['paid', 'issued', 'partially_paid', 'paid'])[g % 4 + 1],
            (select id from parties where organization_id = $1 order by legal_name limit 1),
            $2 || g,
            -- 60 facturas el mismo día y con el mismo created_at: el id tiene que desempatar.
            case when g <= 60 then date '2025-06-01' else date '2025-01-01' + g end,
            date '2025-01-01' + g + 30,
            100,
            case g % 4 when 2 then 40 when 0 then 100 when 3 then 100 else 0 end,
            case when g <= 60 then timestamptz '2025-06-01 10:00:00.123456+02' else now() - g * interval '1 second' end
     from generate_series(1, $3::int) g`,
    [organizationId, prefix, count],
  );
}

async function allPages(ctx: TenantContext, query: InvoiceListQueryInput) {
  const ids: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await invoicing.listPage(ctx, { ...query, ...(cursor ? { cursor } : {}) });
    ids.push(...page.items.map((i) => i.id));
    cursor = page.nextCursor ?? undefined;
    pages++;
  } while (cursor && pages < 50);
  return { ids, pages };
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
  invoicing = createInvoicingService(sql);

  const organizations = createOrganizationsService(sql);
  const memberships = await organizations.memberships(DEMO_USERS.lucia.id);
  orgA = memberships.find((m) => m.slug === 'distribuciones-albar')!.organizationId;
  orgB = memberships.find((m) => m.slug === 'talleres-albar')!.organizationId;
  lucia = { userId: DEMO_USERS.lucia.id, organizationIds: [orgA] };
  const martaOrg = (await organizations.memberships(DEMO_USERS.marta.id)).find((m) => m.slug === 'distribuciones-albar')!.organizationId;
  marta = { userId: DEMO_USERS.marta.id, organizationIds: [martaOrg] };

  await db.exec('alter table invoices disable trigger user');
  await insertReceived(orgA, 130, 'A-');
  await insertReceived(orgB, 40, 'B-');
  await db.exec('alter table invoices enable trigger user');
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

const expectedIds = async (organizationIds: string[], extraWhere = 'true') =>
  (
    await db.query<{ id: string }>(
      `select id from invoices
       where organization_id = any($1::uuid[]) and direction = 'received' and ${extraWhere}
       order by (status = 'draft') desc, sort_date desc, created_at desc, id desc`,
      [`{${organizationIds.join(',')}}`],
    )
  ).rows.map((r) => r.id);

describe('listado de facturas por cursor', () => {
  it('recorre todas las páginas en orden, sin repetir ni saltar filas (con empates)', async () => {
    const { ids, pages } = await allPages(lucia, { direction: 'received', limit: 50 });
    const expected = await expectedIds([orgA]);
    expect(expected.length).toBeGreaterThanOrEqual(130);
    expect(pages).toBe(Math.ceil(expected.length / 50));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expected);
  });

  it('solo devuelve facturas de la empresa activa', async () => {
    const { ids } = await allPages(lucia, { direction: 'received', limit: 100 });
    const fromB = new Set(await expectedIds([orgB]));
    expect(ids.some((id) => fromB.has(id))).toBe(false);
  });

  it('vista consolidada de grupo: dos empresas, mismo orden global', async () => {
    const group: TenantContext = { userId: lucia.userId, organizationIds: [orgA, orgB] };
    const { ids } = await allPages(group, { direction: 'received', limit: 50 });
    expect(ids).toEqual(await expectedIds([orgA, orgB]));
  });

  it('pagina también con filtros', async () => {
    const { ids } = await allPages(lucia, { direction: 'received', status: 'unpaid', limit: 20 });
    expect(ids).toEqual(await expectedIds([orgA], "status in ('issued', 'partially_paid')"));
  });

  it('el pendiente es el de todo el filtro, calculado en la base, no el de la página', async () => {
    const page = await invoicing.listPage(lucia, { direction: 'received', limit: 5 });
    const { rows } = await db.query<{ s: string }>(
      `select coalesce(sum(total - paid_total), 0)::text s from invoices
       where organization_id = $1 and direction = 'received' and status in ('issued', 'partially_paid')`,
      [orgA],
    );
    expect(page.items).toHaveLength(5);
    expect(Number(page.outstandingTotal)).toBeGreaterThan(0);
    expect(page.outstandingTotal).toBe(rows[0]!.s);
  });

  it('la búsqueda trata % y _ como texto, no como comodines', async () => {
    const page = await invoicing.listPage(lucia, { direction: 'received', search: '%' });
    expect(page.items).toHaveLength(0);
  });

  it('rechaza un cursor manipulado con un error de validación', async () => {
    await expect(invoicing.listPage(lucia, { direction: 'received', cursor: 'eyJoYWNrIjp0cnVlfQ' })).rejects.toSatisfy(
      (e) => isDomainError(e) && e.code === 'VALIDATION',
    );
  });

  it('sin permiso de facturación la RLS no devuelve nada, aunque se pida la empresa', async () => {
    const page = await invoicing.listPage(marta, { direction: 'received' });
    expect(page.items).toHaveLength(0);
    expect(page.outstandingTotal).toBe('0');
  });
});
