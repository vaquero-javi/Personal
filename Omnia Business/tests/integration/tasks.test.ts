import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@omnia/core';
import { createSql, type Sql } from '@omnia/db';
import { createOrganizationsService } from '@omnia/organizations';
import { createTasksService } from '@omnia/tasks';
import { DEMO_USERS, seed } from '../../scripts/seed.mjs';

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;
let tasks: ReturnType<typeof createTasksService>;
let carmen: TenantContext; // encargada
let marta: TenantContext; // camarera
let ivan: TenantContext; // camarero

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
  tasks = createTasksService(sql);
  const bar = (await createOrganizationsService(sql).memberships(DEMO_USERS.carmen.id)).find((m) => m.slug === 'bar-la-plaza')!.organizationId;
  carmen = { userId: DEMO_USERS.carmen.id, organizationIds: [bar] };
  marta = { userId: DEMO_USERS.marta.id, organizationIds: [bar] };
  ivan = { userId: DEMO_USERS.ivan.id, organizationIds: [bar] };
}, 120_000);

afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

describe('Tareas', () => {
  it('cada persona ve solo las suyas y la encargada, todas', async () => {
    const paraMarta = await tasks.create(carmen, { title: 'Reponer neveras', assigneeUserId: marta.userId, dueDate: '2026-11-03' });
    const paraIvan = await tasks.create(carmen, { title: 'Limpiar la terraza', assigneeUserId: ivan.userId });

    expect((await tasks.list(marta)).map((t) => t.id)).toEqual([paraMarta]);
    expect((await tasks.list(ivan)).map((t) => t.id)).toEqual([paraIvan]);
    expect((await tasks.list(carmen)).map((t) => t.id).sort()).toEqual([paraMarta, paraIvan].sort());
    expect((await tasks.list(carmen, { assignee: ivan.userId })).map((t) => t.id)).toEqual([paraIvan]);
    await expect(tasks.get(marta, paraIvan)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('un camarero no manda tareas', async () => {
    await expect(tasks.create(marta, { title: 'Hazlo tú', assigneeUserId: ivan.userId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('quien la tiene la marca como hecha, pero no cambia el texto ni la persona', async () => {
    const id = await tasks.create(carmen, { title: 'Contar el cambio', assigneeUserId: marta.userId });
    await tasks.setStatus(marta, id, 'done');
    const done = await tasks.get(marta, id);
    expect(done.status).toBe('done');
    expect(done.completedAt).toBeInstanceOf(Date);

    await expect(tasks.update(marta, id, { title: 'Otra cosa', assigneeUserId: marta.userId })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(tasks.setStatus(ivan, id, 'pending')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(tasks.remove(marta, id)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await tasks.setStatus(marta, id, 'pending');
    expect((await tasks.get(carmen, id)).completedAt).toBeNull();
    await tasks.remove(carmen, id);
  });
});
