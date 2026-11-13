import { z } from 'zod';
import { DomainError, singleOrganization, type TenantContext } from '@omnia/core';
import { asRow, asRows, withTenant, withUser, type Sql } from '@omnia/db';

// Mensajes: correo interno entre las personas de una sociedad (migración 0037).
// La RLS solo enseña las conversaciones en las que participas; las escrituras
// pasan por app.message_* (DEFINER), que validan destinatarios y participantes.

export type Mailbox = 'inbox' | 'starred' | 'sent' | 'archived';
export const MAILBOXES: readonly Mailbox[] = ['inbox', 'starred', 'sent', 'archived'];

export interface ThreadSummary {
  id: string;
  subject: string;
  lastMessageAt: Date;
  lastSenderName: string;
  snippet: string;
  /** Las demás personas de la conversación (sin ti). */
  otherNames: string[];
  messageCount: number;
  unread: boolean;
  starred: boolean;
  archived: boolean;
}

export interface ThreadMessage {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: Date;
}

export interface ThreadDetail {
  id: string;
  subject: string;
  starred: boolean;
  archived: boolean;
  participants: { userId: string; name: string }[];
  messages: ThreadMessage[];
  /** Estaba sin leer al abrirla (y al abrirla se ha marcado leída). */
  wasUnread: boolean;
}

const Body = z.string().trim().min(1, 'Escribe el mensaje').max(20000, 'Demasiado largo');

export const ComposeInput = z.object({
  subject: z.string().trim().min(1, 'Pon un asunto').max(200),
  body: Body,
  recipients: z.preprocess(
    (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []),
    z.array(z.uuid()).min(1, 'Elige al menos a una persona').max(100),
  ),
});

export const ReplyInput = z.object({ threadId: z.uuid(), body: Body });

export const ThreadStateInput = z.object({
  threadId: z.uuid(),
  read: z.boolean().optional(),
  archived: z.boolean().optional(),
  starred: z.boolean().optional(),
});

export function createMessagesService(sql: Sql) {
  return {
    async list(ctx: TenantContext, box: Mailbox = 'inbox'): Promise<ThreadSummary[]> {
      const orgId = singleOrganization(ctx);
      const mailbox = z.enum(MAILBOXES as [Mailbox, ...Mailbox[]]).parse(box);
      return withTenant(sql, ctx, async (tx) =>
        asRows<ThreadSummary>(await tx`
          select t.id, t.subject, t.last_message_at,
                 coalesce(su.full_name, su.email) as last_sender_name,
                 left(regexp_replace(lm.body, '\\s+', ' ', 'g'), 160) as snippet,
                 array(select coalesce(u.full_name, u.email) from message_participants p join users u on u.id = p.user_id
                       where p.thread_id = t.id and p.user_id <> ${ctx.userId} order by u.full_name) as other_names,
                 (select count(*)::int from messages m where m.thread_id = t.id) as message_count,
                 (me.last_read_at is null or me.last_read_at < t.last_message_at) as unread,
                 me.starred, me.archived_at is not null as archived
          from message_threads t
          join message_participants me on me.thread_id = t.id and me.user_id = ${ctx.userId}
          join lateral (select m.body, m.sender_id from messages m where m.thread_id = t.id order by m.created_at desc limit 1) lm on true
          join users su on su.id = lm.sender_id
          where t.organization_id = ${orgId}
            and case ${mailbox}
                  when 'inbox' then me.archived_at is null
                  when 'starred' then me.starred
                  when 'archived' then me.archived_at is not null
                  when 'sent' then exists (select 1 from messages m where m.thread_id = t.id and m.sender_id = ${ctx.userId})
                end
          order by t.last_message_at desc
          limit 200`),
      );
    },

    async unreadCount(ctx: TenantContext): Promise<number> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [row] = await tx<{ n: number }[]>`
          select count(*)::int as n from message_participants me join message_threads t on t.id = me.thread_id
          where me.user_id = ${ctx.userId} and t.organization_id = ${orgId} and me.archived_at is null
            and (me.last_read_at is null or me.last_read_at < t.last_message_at)`;
        return row?.n ?? 0;
      });
    },

    /** La conversación (si participas). Al abrirla queda leída. */
    async get(ctx: TenantContext, id: string, { markRead = true } = {}): Promise<ThreadDetail> {
      const threadId = z.uuid().parse(id);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const thread = asRow<{ id: string; subject: string; starred: boolean; archived: boolean; wasUnread: boolean }>(await tx`
          select t.id, t.subject, me.starred, me.archived_at is not null as archived,
                 (me.last_read_at is null or me.last_read_at < t.last_message_at) as was_unread
          from message_threads t join message_participants me on me.thread_id = t.id and me.user_id = ${ctx.userId}
          where t.id = ${threadId} and t.organization_id = ${orgId}`);
        if (!thread) throw new DomainError('NOT_FOUND', 'Conversación no encontrada');
        const participants = asRows<{ userId: string; name: string }>(await tx`
          select p.user_id, coalesce(u.full_name, u.email) as name from message_participants p join users u on u.id = p.user_id
          where p.thread_id = ${threadId} order by u.full_name`);
        const messages = asRows<ThreadMessage>(await tx`
          select m.id, m.sender_id, coalesce(u.full_name, u.email) as sender_name, m.body, m.created_at
          from messages m join users u on u.id = m.sender_id where m.thread_id = ${threadId} order by m.created_at, m.id`);
        if (markRead) await tx`select app.message_set_state(${threadId}, true, null, null)`;
        return { ...thread, participants, messages };
      });
    },

    async compose(ctx: TenantContext, raw: unknown): Promise<string> {
      const input = ComposeInput.parse(raw);
      singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [row] = await tx<{ id: string }[]>`
          select app.message_send(${input.subject}, ${input.body}, ${input.recipients}::uuid[]) as id`;
        return row!.id;
      });
    },

    async reply(ctx: TenantContext, raw: unknown) {
      const input = ReplyInput.parse(raw);
      singleOrganization(ctx);
      await withTenant(sql, ctx, (tx) => tx`select app.message_reply(${input.threadId}, ${input.body})`);
    },

    async setState(ctx: TenantContext, raw: unknown) {
      const input = ThreadStateInput.parse(raw);
      singleOrganization(ctx);
      await withTenant(sql, ctx, (tx) =>
        tx`select app.message_set_state(${input.threadId}, ${input.read ?? null}, ${input.archived ?? null}, ${input.starred ?? null})`,
      );
    },

    /** Personas a las que se puede escribir: miembros activos de la sociedad, salvo tú. */
    async recipients(ctx: TenantContext): Promise<{ userId: string; name: string; roleName: string }[]> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) =>
        asRows<{ userId: string; name: string; roleName: string }>(await tx`
          select uo.user_id, coalesce(u.full_name, u.email) as name, r.name as role_name
          from user_organizations uo join users u on u.id = uo.user_id join roles r on r.id = uo.role_id
          where uo.organization_id = ${orgId} and uo.status = 'active' and uo.user_id <> ${ctx.userId}
          order by u.full_name`),
      );
    },
  };
}

export type MessagesService = ReturnType<typeof createMessagesService>;

/** No leídos de todas mis sociedades (barra lateral), sin sociedad activa. */
export async function unreadByOrganization(sql: Sql, userId: string): Promise<Map<string, number>> {
  const rows = await withUser(sql, userId, (tx) => tx<{ organization_id: string; unread: number }[]>`select * from app.my_unread_messages()`);
  return new Map(rows.map((r) => [r.organization_id, r.unread]));
}
