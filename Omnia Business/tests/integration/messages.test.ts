import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@omnia/core';
import { createSql, type Sql } from '@omnia/db';
import { createMessagesService, unreadByOrganization } from '@omnia/messages';
import { createOrganizationsService } from '@omnia/organizations';
import { DEMO_USERS, seed } from '../../scripts/seed.mjs';

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);
let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let messages: ReturnType<typeof createMessagesService>;
let bar: string;
const ctx = (user: { id: string }): TenantContext => ({ userId: user.id, organizationIds: [bar] });

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
  messages = createMessagesService(sql);
  bar = (await createOrganizationsService(sql).memberships(DEMO_USERS.lucia.id)).find((m) => m.slug === 'bar-la-plaza')!.organizationId;
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

describe('Mensajes', () => {
  it('la semilla deja conversaciones en las bandejas de quien participa', async () => {
    const ivan = await messages.list(ctx(DEMO_USERS.ivan), 'inbox');
    expect(ivan.map((t) => t.subject)).toEqual(['Turnos del fin de semana']);
    expect(ivan[0]).toMatchObject({ unread: true, messageCount: 2, lastSenderName: 'Marta Ortega' });
    expect((await messages.list(ctx(DEMO_USERS.carmen), 'inbox')).map((t) => t.subject).sort()).toEqual(['Inventario de fin de mes', 'Turnos del fin de semana']);
  });

  it('la propietaria no ve conversaciones en las que no está, ni abriéndolas por id', async () => {
    const id = (await messages.list(ctx(DEMO_USERS.ivan), 'inbox'))[0]!.id;
    expect((await messages.list(ctx(DEMO_USERS.lucia), 'inbox')).some((t) => t.id === id)).toBe(false);
    await expect(messages.get(ctx(DEMO_USERS.lucia), id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('redactar, responder, leer, archivar y destacar', async () => {
    const id = await messages.compose(ctx(DEMO_USERS.marta), { subject: 'Llaves', body: 'Me dejo las llaves en la caja.', recipients: DEMO_USERS.ivan.id });
    expect((await messages.list(ctx(DEMO_USERS.marta), 'sent')).some((t) => t.id === id)).toBe(true);
    expect(await messages.unreadCount(ctx(DEMO_USERS.ivan))).toBe(2);

    const opened = await messages.get(ctx(DEMO_USERS.ivan), id);
    expect(opened.messages.map((m) => m.body)).toEqual(['Me dejo las llaves en la caja.']);
    expect(await messages.unreadCount(ctx(DEMO_USERS.ivan))).toBe(1);

    await messages.reply(ctx(DEMO_USERS.ivan), { threadId: id, body: 'Recibido, gracias.' });
    await messages.setState(ctx(DEMO_USERS.marta), { threadId: id, archived: true, starred: true });
    expect((await messages.list(ctx(DEMO_USERS.marta), 'inbox')).some((t) => t.id === id)).toBe(false);
    expect((await messages.list(ctx(DEMO_USERS.marta), 'archived')).find((t) => t.id === id)).toMatchObject({ starred: true });
    expect((await messages.list(ctx(DEMO_USERS.marta), 'starred')).some((t) => t.id === id)).toBe(true);
  });

  it('valida la entrada', async () => {
    await expect(messages.compose(ctx(DEMO_USERS.marta), { subject: '', body: 'x', recipients: [DEMO_USERS.ivan.id] })).rejects.toThrow();
    await expect(messages.compose(ctx(DEMO_USERS.marta), { subject: 'x', body: 'x', recipients: [] })).rejects.toThrow();
    await expect(messages.compose(ctx(DEMO_USERS.marta), { subject: 'x', body: 'x', recipients: [DEMO_USERS.ruben.id] })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('no leídos por sociedad para la barra lateral', async () => {
    const map = await unreadByOrganization(sql, DEMO_USERS.carmen.id);
    expect(map.get(bar)).toBeGreaterThan(0);
  });

  it('destinatarios: la gente activa de la sociedad, sin ti', async () => {
    const list = await messages.recipients(ctx(DEMO_USERS.marta));
    expect(list.some((p) => p.userId === DEMO_USERS.marta.id)).toBe(false);
    expect(list.some((p) => p.userId === DEMO_USERS.carmen.id)).toBe(true);
  });
});

describe('Mensajes de error de la base', () => {
  it('el motivo real llega a la pantalla', async () => {
    await expect(messages.compose(ctx(DEMO_USERS.marta), { subject: 'x', body: 'x', recipients: [DEMO_USERS.ruben.id] })).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Algún destinatario no pertenece a esta sociedad',
    });
  });
});
