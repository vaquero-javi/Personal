import { z } from 'zod';
import { DomainError, optionalText, optionalUuid, requiredText, singleOrganization, type TenantContext } from '@omnia/core';
import { asRow, asRows, withTenant, type Sql } from '@omnia/db';

export type IncidentStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
export type IncidentPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface IncidentSummary {
  id: string;
  number: number;
  title: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  category: string | null;
  subjectName: string | null;
  subjectKind: 'party' | 'employee' | null;
  assigneeName: string | null;
  reportedByName: string;
  createdAt: Date;
  dueAt: Date | null;
  commentCount: number;
}

export interface IncidentDetail extends IncidentSummary {
  description: string | null;
  partyId: string | null;
  employeeUserId: string | null;
  assigneeUserId: string | null;
  reportedBy: string;
  resolvedAt: Date | null;
  comments: { id: string; authorName: string; body: string; createdAt: Date }[];
}

export const IncidentInput = z
  .object({
    title: requiredText(200).refine((t) => t.length >= 3, 'Mínimo 3 caracteres'),
    description: optionalText(5000),
    category: optionalText(60),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    partyId: optionalUuid(),
    employeeUserId: optionalUuid(),
    assigneeUserId: optionalUuid(),
  })
  .refine((v) => !(v.partyId && v.employeeUserId), { message: 'Elige un cliente/proveedor o un empleado, no ambos', path: ['employeeUserId'] });

export const IncidentUpdateInput = z.object({
  status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  assigneeUserId: optionalUuid(),
});

export function createIncidentsService(sql: Sql) {
  return {
    async list(
      ctx: TenantContext,
      { status = 'active', mine = false, search }: { status?: string; mine?: boolean; search?: string } = {},
    ): Promise<IncidentSummary[]> {
      const term = search?.trim() ? `%${search.trim()}%` : null;
      return withTenant(sql, ctx, async (tx) =>
        asRows<IncidentSummary>(await tx`
          select i.id, i.number::int, i.title, i.status, i.priority, i.category,
                 coalesce(p.legal_name, eu.full_name) as subject_name,
                 case when i.party_id is not null then 'party' when i.employee_user_id is not null then 'employee' end as subject_kind,
                 au.full_name as assignee_name, ru.full_name as reported_by_name, i.created_at, i.due_at,
                 (select count(*)::int from incident_comments c where c.incident_id = i.id) as comment_count
          from incidents i
          left join parties p on p.id = i.party_id
          left join users eu on eu.id = i.employee_user_id
          left join users au on au.id = i.assignee_user_id
          join users ru on ru.id = i.reported_by
          where (${status} = 'all' or (${status} = 'active' and i.status not in ('resolved', 'closed')) or i.status = ${status})
            and (not ${mine} or i.assignee_user_id = ${ctx.userId} or i.reported_by = ${ctx.userId})
            and (${term}::text is null or i.title ilike ${term} or i.number::text = ${search?.trim() ?? ''})
          order by array_position(array['urgent','high','normal','low'], i.priority), i.created_at desc`),
      );
    },

    async get(ctx: TenantContext, id: string): Promise<IncidentDetail> {
      const incidentId = z.uuid().parse(id);
      return withTenant(sql, ctx, async (tx) => {
        const inc = asRow<IncidentDetail>(await tx`
          select i.id, i.number::int, i.title, i.description, i.status, i.priority, i.category, i.party_id, i.employee_user_id,
                 i.assignee_user_id, i.reported_by, i.created_at, i.due_at, i.resolved_at,
                 coalesce(p.legal_name, eu.full_name) as subject_name,
                 case when i.party_id is not null then 'party' when i.employee_user_id is not null then 'employee' end as subject_kind,
                 au.full_name as assignee_name, ru.full_name as reported_by_name, 0 as comment_count
          from incidents i
          left join parties p on p.id = i.party_id
          left join users eu on eu.id = i.employee_user_id
          left join users au on au.id = i.assignee_user_id
          join users ru on ru.id = i.reported_by
          where i.id = ${incidentId}`);
        if (!inc) throw new DomainError('NOT_FOUND', 'Incidencia no encontrada');
        inc.comments = asRows(await tx`
          select c.id, u.full_name as author_name, c.body, c.created_at
          from incident_comments c join users u on u.id = c.author_id
          where c.incident_id = ${incidentId} order by c.created_at`);
        inc.commentCount = inc.comments.length;
        return inc;
      });
    },

    async create(ctx: TenantContext, raw: unknown): Promise<string> {
      const input = IncidentInput.parse(raw);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [row] = await tx<{ id: string }[]>`
          insert into incidents (organization_id, title, description, category, priority, party_id, employee_user_id, assignee_user_id)
          values (${orgId}, ${input.title}, ${input.description ?? null}, ${input.category ?? null}, ${input.priority},
                  ${input.partyId ?? null}, ${input.employeeUserId ?? null}, ${input.assigneeUserId ?? null})
          returning id`;
        return row!.id;
      });
    },

    async update(ctx: TenantContext, id: string, raw: unknown) {
      const input = IncidentUpdateInput.parse(raw);
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`
          update incidents set status = ${input.status}, priority = ${input.priority}, assignee_user_id = ${input.assigneeUserId ?? null}
          where id = ${z.uuid().parse(id)} returning id`;
        if (rows.length === 0) {
          throw new DomainError('FORBIDDEN', 'Solo quien la tiene asignada o un responsable puede cambiar esta incidencia');
        }
      });
    },

    async comment(ctx: TenantContext, id: string, body: unknown) {
      const text = requiredText(5000, 'Escribe un comentario').parse(body);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, (tx) => tx`
        insert into incident_comments (organization_id, incident_id, body) values (${orgId}, ${z.uuid().parse(id)}, ${text})`);
    },
  };
}

export type IncidentsService = ReturnType<typeof createIncidentsService>;
