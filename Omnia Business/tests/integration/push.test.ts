import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@omnia/core';
import { createSql, withUser, type Sql } from '@omnia/db';
import { createHrService } from '@omnia/hr';
import { createIncidentsService } from '@omnia/incidents';
import { createMessagesService } from '@omnia/messages';
import { createOrganizationsService } from '@omnia/organizations';
import { createTasksService } from '@omnia/tasks';
import { DEMO_USERS, seed } from '../../scripts/seed.mjs';

// Notificaciones push (0049): qué encola cada acción, para quién, y que solo
// quien provoca el aviso puede recogerlo.

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let asLucia: TenantContext;
let asMarta: TenantContext;
const lucia = DEMO_USERS.lucia.id;
const marta = DEMO_USERS.marta.id;

type Claimed = { user_id: string; title: string; body: string; url: string; endpoint: string };
const claim = (userId: string) => withUser(sql, userId, async (tx) => (await tx`select * from app.claim_push_outbox()`) as unknown as Claimed[]);

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
  const orgs = createOrganizationsService(sql);
  const shared = (await orgs.memberships(marta))[0]!;
  asLucia = { userId: lucia, organizationIds: [shared.organizationId] };
  asMarta = { userId: marta, organizationIds: [shared.organizationId] };
  // Un dispositivo para cada una.
  for (const [id, n] of [[lucia, 1], [marta, 2]] as const) {
    await sql`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (${id}, ${`https://push.example/${n}`}, 'k', 'a')`;
  }
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

describe('Notificaciones push', () => {
  it('mensaje: avisa al resto del hilo, no a quien escribe, y solo lo recoge quien lo provocó', async () => {
    await createMessagesService(sql).compose(asLucia, { subject: 'Inventario', body: 'Mañana contamos la cámara', recipients: [marta] });
    expect(await claim(marta)).toEqual([]); // Marta no puede recoger avisos que no ha provocado.
    const sent = await claim(lucia);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ user_id: marta, endpoint: 'https://push.example/2', title: 'Lucía Ferrer: Inventario' });
    expect(sent[0]!.url).toMatch(/^\/o\/[^/]+\/mensajes\/c\//);
    expect(await claim(lucia)).toEqual([]); // Ya recogido: no se manda dos veces.
  });

  it('tarea asignada → la responsable', async () => {
    await createTasksService(sql).create(asLucia, { title: 'Revisar albaranes', assigneeUserId: marta, dueDate: '2026-11-20' });
    const [sent] = await claim(lucia);
    expect(sent).toMatchObject({ user_id: marta, title: 'Tarea nueva para ti', body: expect.stringContaining('Revisar albaranes · para el 20/11') });
  });

  it('incidencia asignada y comentada', async () => {
    const incidents = createIncidentsService(sql);
    const id = await incidents.create(asLucia, { title: 'Grifo roto en barra', assigneeUserId: marta });
    expect((await claim(lucia)).map((r) => r.user_id)).toEqual([marta]);
    await incidents.comment(asMarta, id, 'Ya he llamado al fontanero');
    expect(await claim(marta)).toEqual([expect.objectContaining({ user_id: lucia, body: expect.stringContaining('fontanero') })]);
  });

  it('ausencia: la solicitud avisa a quien aprueba y la resolución a quien la pidió', async () => {
    const hr = createHrService(sql);
    await hr.requestLeave(asMarta, { leaveType: 'vacation', startsOn: '2026-12-01', endsOn: '2026-12-05' });
    const requested = await claim(marta);
    expect(requested.map((r) => r.user_id)).toContain(lucia);
    expect(requested.map((r) => r.user_id)).not.toContain(marta);
    expect(requested[0]!.title).toBe('Marta Ortega pide vacaciones');

    const [leave] = (await hr.leaves(asLucia)).filter((l) => l.userId === marta && l.startsOn === '2026-12-01');
    await hr.reviewLeave(asLucia, leave!.id, 'approved');
    expect(await claim(lucia)).toEqual([expect.objectContaining({ user_id: marta, title: 'Vacaciones aprobada', body: expect.stringContaining('01/12–05/12') })]);
  });

  it('sin dispositivo no se manda nada, pero no falla', async () => {
    await sql`delete from push_subscriptions where user_id = ${marta}`;
    await createTasksService(sql).create(asLucia, { title: 'Otra tarea', assigneeUserId: marta });
    expect(await claim(lucia)).toEqual([]);
  });

  it('quien silencia un tipo de aviso no lo recibe, pero sí los demás', async () => {
    await sql`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (${marta}, 'https://push.example/3', 'k', 'a')`;
    const set = (category: string, enabled: boolean) =>
      withUser(sql, marta, async (tx) => ((await tx`select app.set_push_category(${category}, ${enabled}) as muted`)[0] as { muted: string[] }).muted);
    expect(await set('tasks', false)).toEqual(['tasks']);
    expect(await set('payslips', false)).toEqual(expect.arrayContaining(['tasks', 'payslips']));
    expect(await set('payslips', true)).toEqual(['tasks']);

    await createTasksService(sql).create(asLucia, { title: 'Tarea silenciada', assigneeUserId: marta });
    expect(await claim(lucia)).toEqual([]);

    await createMessagesService(sql).compose(asLucia, { subject: 'Turnos', body: 'Mira el cuadrante', recipients: [marta] });
    expect((await claim(lucia)).map((r) => r.user_id)).toEqual([marta]);
  });

  it('solo se aceptan tipos de aviso conocidos', async () => {
    await expect(sql`update push_preferences set muted = '{spam}' where user_id = ${marta}`).rejects.toThrow();
  });

  it('dar acceso a alguien que ya usa Omnia le avisa; a una invitación nueva, no', async () => {
    const orgs = createOrganizationsService(sql);
    const roleId = (await orgs.roles(asLucia)).find((r) => r.key === 'employee')!.id;
    const addPerson = async (email: string, status: 'active' | 'invited') => {
      const member = await orgs.prepareMember(asLucia, { firstName: 'Socia', lastName: 'Prueba', email, roleId });
      const [{ id }] = (await sql<{ id: string }[]>`insert into users (id, email) values (gen_random_uuid(), ${email}) returning id`) as [{ id: string }];
      await sql`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (${id}, ${`https://push.example/${email}`}, 'k', 'a')`;
      await orgs.addMember(asLucia, member, id, status);
      return id;
    };

    const partner = await addPerson('socia@ejemplo.es', 'active');
    const [sent] = await claim(lucia);
    expect(sent).toMatchObject({ user_id: partner, title: 'Te han dado acceso a una sociedad nueva', body: expect.stringContaining('Lucía Ferrer te ha añadido con el rol') });
    expect(sent!.url).toMatch(/^\/o\/[a-z0-9-]+$/);

    await addPerson('nueva@ejemplo.es', 'invited');
    expect(await claim(lucia)).toEqual([]);
  });
});
