import { z } from 'zod';
import { DomainError, optionalIsoDate, optionalText, optionalUuid, requiredText, singleOrganization, type TenantContext } from '@omnia/core';
import { asRow, asRows, withTenant, withUser, type Sql } from '@omnia/db';

export type TaskStatus = 'pending' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigneeUserId: string;
  assigneeName: string;
  assignedByName: string;
  dueDate: string | null;
  completedAt: Date | null;
  createdAt: Date;
}

export const TaskInput = z.object({
  title: requiredText(200).refine((t) => t.length >= 3, 'Mínimo 3 caracteres'),
  description: optionalText(5000),
  assigneeUserId: z.uuid({ error: 'Elige a quién se la mandas' }),
  dueDate: optionalIsoDate(),
});

const TaskStatusInput = z.enum(['pending', 'in_progress', 'done']);

/**
 * Tareas que un responsable (tasks.manage) manda a una persona. La RLS hace
 * que cada uno vea solo las suyas y el responsable, todas.
 */
export function createTasksService(sql: Sql) {
  return {
    async list(
      ctx: TenantContext,
      { status = 'open', assignee }: { status?: 'open' | 'done' | 'all'; assignee?: string } = {},
    ): Promise<Task[]> {
      const person = assignee ? z.uuid().parse(assignee) : null;
      return withTenant(sql, ctx, async (tx) =>
        asRows<Task>(await tx`
          select t.id, t.title, t.description, t.status, t.assignee_user_id, coalesce(au.full_name, au.email) as assignee_name,
                 coalesce(bu.full_name, bu.email) as assigned_by_name, t.due_date::text, t.completed_at, t.created_at
          from tasks t
          join users au on au.id = t.assignee_user_id
          join users bu on bu.id = t.assigned_by
          where (${status} = 'all' or (${status} = 'open' and t.status <> 'done') or (${status} = 'done' and t.status = 'done'))
            and (${person}::uuid is null or t.assignee_user_id = ${person})
          order by (t.status = 'done'), t.due_date nulls last, t.created_at desc
          limit 500`),
      );
    },

    async get(ctx: TenantContext, id: string): Promise<Task> {
      return withTenant(sql, ctx, async (tx) => {
        const task = asRow<Task>(await tx`
          select t.id, t.title, t.description, t.status, t.assignee_user_id, coalesce(au.full_name, au.email) as assignee_name,
                 coalesce(bu.full_name, bu.email) as assigned_by_name, t.due_date::text, t.completed_at, t.created_at
          from tasks t
          join users au on au.id = t.assignee_user_id
          join users bu on bu.id = t.assigned_by
          where t.id = ${z.uuid().parse(id)}`);
        if (!task) throw new DomainError('NOT_FOUND', 'Tarea no encontrada');
        return task;
      });
    },

    async create(ctx: TenantContext, raw: unknown): Promise<string> {
      const input = TaskInput.parse(raw);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [row] = await tx<{ id: string }[]>`
          insert into tasks (organization_id, title, description, assignee_user_id, due_date)
          values (${orgId}, ${input.title}, ${input.description ?? null}, ${input.assigneeUserId}, ${input.dueDate ?? null})
          returning id`;
        return row!.id;
      });
    },

    /** Solo un responsable: la RLS y la guarda lo impiden a los demás. */
    async update(ctx: TenantContext, id: string, raw: unknown) {
      const input = TaskInput.parse(raw);
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`
          update tasks set title = ${input.title}, description = ${input.description ?? null},
                 assignee_user_id = ${input.assigneeUserId}, due_date = ${input.dueDate ?? null}
          where id = ${z.uuid().parse(id)} returning id`;
        if (rows.length === 0) throw new DomainError('NOT_FOUND', 'Tarea no encontrada');
      });
    },

    /** Quien la tiene asignada (o un responsable) la marca como empezada, hecha o pendiente. */
    async setStatus(ctx: TenantContext, id: string, status: unknown) {
      const next = TaskStatusInput.parse(status);
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`update tasks set status = ${next} where id = ${z.uuid().parse(id)} returning id`;
        if (rows.length === 0) throw new DomainError('NOT_FOUND', 'Tarea no encontrada');
      });
    },

    async remove(ctx: TenantContext, id: string) {
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`delete from tasks where id = ${z.uuid().parse(id)} returning id`;
        if (rows.length === 0) throw new DomainError('FORBIDDEN', 'Solo un responsable borra tareas');
      });
    },
  };
}

export type TasksService = ReturnType<typeof createTasksService>;

/** Tareas que te han mandado y no has hecho, de todas mis sociedades (barra lateral), sin sociedad activa. */
export async function pendingByOrganization(sql: Sql, userId: string): Promise<Map<string, number>> {
  const rows = await withUser(sql, userId, (tx) => tx<{ organization_id: string; pending: number }[]>`select * from app.my_pending_tasks()`);
  return new Map(rows.map((r) => [r.organization_id, r.pending]));
}
