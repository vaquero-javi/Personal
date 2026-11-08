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
let lucia: TenantContext; // propietaria
let carmen: TenantContext; // pasará a Gerente
let marta: TenantContext; // camarera

const roleId = async (name: string) => (await orgs.roles(lucia)).find((r) => r.name === name)!.id;

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
  const bar = (await orgs.memberships(DEMO_USERS.lucia.id)).find((m) => m.slug === 'bar-la-plaza')!.organizationId;
  lucia = { userId: DEMO_USERS.lucia.id, organizationIds: [bar] };
  carmen = { userId: DEMO_USERS.carmen.id, organizationIds: [bar] };
  marta = { userId: DEMO_USERS.marta.id, organizationIds: [bar] };
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

describe('Eliminar roles', () => {
  it('la propietaria elimina un rol con personas pasándolas a otro', async () => {
    await orgs.saveRole(lucia, { name: 'Temporada', permissions: ['pos.use'] });
    await orgs.saveRole(lucia, { name: 'Extra', permissions: ['pos.use'] });
    await orgs.updateMember(lucia, { userId: marta.userId, roleId: await roleId('Temporada'), status: 'active' });

    await expect(orgs.deleteRole(lucia, await roleId('Temporada'))).rejects.toMatchObject({ code: 'VALIDATION' });
    await orgs.deleteRole(lucia, await roleId('Temporada'), await roleId('Extra'));

    const roles = await orgs.roles(lucia);
    expect(roles.some((r) => r.name === 'Temporada')).toBe(false);
    expect(roles.find((r) => r.name === 'Extra')!.memberCount).toBe(1);
  });

  it('el rol de propietario no se elimina ni sirve de destino', async () => {
    const owner = (await orgs.roles(lucia)).find((r) => r.isSystem)!.id;
    await expect(orgs.deleteRole(lucia, owner)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(orgs.deleteRole(lucia, await roleId('Extra'), owner)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('un Gerente con «Eliminar roles» borra roles vacíos; para mover personas necesita también cambiar roles', async () => {
    await orgs.saveRole(lucia, { name: 'Gerente', permissions: ['roles.delete', 'members.read'] });
    await orgs.updateMember(lucia, { userId: carmen.userId, roleId: await roleId('Gerente'), status: 'active' });

    await orgs.saveRole(lucia, { name: 'Vacío', permissions: [] });
    await orgs.deleteRole(carmen, await roleId('Vacío'));
    expect((await orgs.roles(lucia)).some((r) => r.name === 'Vacío')).toBe(false);

    // Extra tiene a Marta: sin 'members.manage' no puede pasarla a otro rol.
    const camarero = await roleId('Camarero');
    await expect(orgs.deleteRole(carmen, await roleId('Extra'), camarero)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await orgs.saveRole(lucia, { id: await roleId('Gerente'), name: 'Gerente', permissions: ['roles.delete', 'members.read', 'members.manage'] });
    await orgs.deleteRole(carmen, await roleId('Extra'), camarero);
    expect((await orgs.roles(lucia)).some((r) => r.name === 'Extra')).toBe(false);
  });

  it('crear y editar roles no basta para eliminarlos (la RLS lo exige)', async () => {
    await orgs.saveRole(lucia, { id: await roleId('Gerente'), name: 'Gerente', permissions: ['roles.manage'] });
    await orgs.saveRole(lucia, { name: 'Otro vacío', permissions: [] });
    await expect(orgs.deleteRole(carmen, await roleId('Otro vacío'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // Ni saltándose la comprobación de la aplicación: la política de la tabla lo impide.
    const rows = await sql.begin(async (tx) => {
      await tx`select set_config('app.user_id', ${carmen.userId}, true), set_config('app.org_ids', ${`{${carmen.organizationIds[0]}}`}, true)`;
      await tx`set local role app_user`;
      return tx`delete from roles where name = 'Otro vacío' returning id`;
    });
    expect(rows).toHaveLength(0);
  });
});
