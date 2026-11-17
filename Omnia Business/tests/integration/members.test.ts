import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@omnia/core';
import { createSql, type Sql } from '@omnia/db';
import { createOrganizationsService } from '@omnia/organizations';
import { DEMO_USERS, seed } from '../../scripts/seed.mjs';

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let orgs: ReturnType<typeof createOrganizationsService>;
let ctx: TenantContext;
let employeeRole: string;
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
  const [org] = await orgs.memberships(lucia);
  ctx = { userId: lucia, organizationIds: [org!.organizationId] };
  employeeRole = (await orgs.roles(ctx)).find((r) => r.key === 'employee')!.id;
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

describe('Alta de miembros por invitación', () => {
  it('una persona sin cuenta queda invitada (sin acceso) hasta que entra', async () => {
    const member = await orgs.prepareMember(ctx, { firstName: 'Nora', lastName: 'Gil Vega', email: 'Nora@Ejemplo.es', roleId: employeeRole, employeeCode: 'X-900' });
    expect(member).toMatchObject({ fullName: 'Nora Gil Vega', email: 'nora@ejemplo.es', existingUserId: null, roleName: expect.any(String) });

    // La cuenta la crea el proveedor de identidad (aquí, a mano, como hace el trigger de Supabase).
    const [{ id }] = (await sql<{ id: string }[]>`insert into users (id, email) values (gen_random_uuid(), ${member.email}) returning id`) as [{ id: string }];
    await orgs.addMember(ctx, member, id, 'invited');

    const added = await orgs.member(ctx, id);
    expect(added).toMatchObject({ status: 'invited', fullName: 'Nora Gil Vega', employeeCode: 'X-900' });
    expect(await orgs.memberships(id)).toHaveLength(0);

    expect(await orgs.acceptInvitations(id)).toBe(1);
    expect((await orgs.member(ctx, id)).status).toBe('active');
    expect(await orgs.memberships(id)).toHaveLength(1);
  });

  it('no deja añadir dos veces a la misma persona ni repetir código', async () => {
    await expect(orgs.prepareMember(ctx, { firstName: 'Nora', lastName: 'Gil', email: 'nora@ejemplo.es', roleId: employeeRole })).rejects.toThrow(/ya es miembro/);
    await expect(orgs.prepareMember(ctx, { firstName: 'Otra', lastName: 'Persona', email: 'otra@ejemplo.es', roleId: employeeRole, employeeCode: 'x-900' })).rejects.toThrow(/ya lo tiene Nora Gil Vega/);
  });

  it('exige nombre y apellidos', async () => {
    await expect(orgs.prepareMember(ctx, { firstName: '', lastName: '', email: 'sin@nombre.es', roleId: employeeRole })).rejects.toThrow();
  });

  it('editar una invitación sin estado la mantiene invitada', async () => {
    const member = await orgs.prepareMember(ctx, { firstName: 'Pau', lastName: 'Ros', email: 'pau@ejemplo.es', roleId: employeeRole });
    const [{ id }] = (await sql<{ id: string }[]>`insert into users (id, email) values (gen_random_uuid(), ${member.email}) returning id`) as [{ id: string }];
    await orgs.addMember(ctx, member, id, 'invited');
    await orgs.updateMember(ctx, { userId: id, roleId: employeeRole, employeeCode: 'P-1' });
    expect(await orgs.member(ctx, id)).toMatchObject({ status: 'invited', employeeCode: 'P-1' });
  });

  it('solo se borra a un suspendido, y solo si no tiene historial', async () => {
    const member = await orgs.prepareMember(ctx, { firstName: 'Error', lastName: 'De Alta', email: 'error@ejemplo.es', roleId: employeeRole });
    const [{ id }] = (await sql<{ id: string }[]>`insert into users (id, email) values (gen_random_uuid(), ${member.email}) returning id`) as [{ id: string }];
    await orgs.addMember(ctx, member, id, 'active');

    await expect(orgs.removeMember(ctx, id)).rejects.toThrow(/Suspende/);
    await expect(orgs.removeMember(ctx, lucia)).rejects.toThrow(/ti mismo/);

    await orgs.updateMember(ctx, { userId: id, roleId: employeeRole, status: 'suspended' });
    await orgs.removeMember(ctx, id);
    await expect(orgs.member(ctx, id)).rejects.toThrow(/no es miembro/);
  });

  it('con fichajes no se borra: se explica y se queda suspendido', async () => {
    const withHistory = (await orgs.members(ctx)).find((m) => m.userId !== lucia && m.status === 'active')!;
    const [{ n }] = (await sql<{ n: number }[]>`select count(*)::int as n from time_entries where user_id = ${withHistory.userId}`) as [{ n: number }];
    expect(n).toBeGreaterThan(0);
    await orgs.updateMember(ctx, { userId: withHistory.userId, roleId: withHistory.roleId, status: 'suspended' });
    await expect(orgs.removeMember(ctx, withHistory.userId)).rejects.toThrow(/tiene .*(fichajes|registros)/);
    expect((await orgs.member(ctx, withHistory.userId)).status).toBe('suspended');
  });
});
