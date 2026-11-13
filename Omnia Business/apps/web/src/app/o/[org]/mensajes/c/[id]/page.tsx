import { notFound } from 'next/navigation';
import { Archive, Inbox, MailOpen, Star } from 'lucide-react';
import { isDomainError } from '@omnia/core';
import { Cell, PageHeader } from '@/components/ui/layout';
import { ActionForm, TextAreaField } from '@/components/ui/form';
import { Button, SubmitButton } from '@/components/ui/button';
import { RefreshOnce } from '@/features/messages/refresh-once';
import { longWhen } from '@/features/messages/when';
import { LiveRefresh } from '@/features/stats/live-refresh';
import { initials } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { replyMessage, setThreadState } from '../../actions';

export const metadata = { title: 'Conversación · Mensajes · Omnia' };

export default async function ThreadPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const { ctx } = await requireOrg(org);
  // Abrirla la marca como leída. Si no participas, no existe (no se revela).
  const thread = await container()
    .messages.get(ctx, id)
    .catch((error: unknown) => {
      if (isDomainError(error) && (error.code === 'NOT_FOUND' || error.code === 'VALIDATION')) notFound();
      throw error;
    });
  const others = thread.participants.filter((p) => p.userId !== ctx.userId);
  const back = thread.archived ? { href: `/o/${org}/mensajes/archivados`, label: 'Archivados' } : { href: `/o/${org}/mensajes`, label: 'Recibidos' };

  return (
    <>
      <RefreshOnce when={thread.wasUnread} />
      <PageHeader
        back={back}
        title={thread.subject}
        description={`Con ${others.map((p) => p.name).join(', ') || 'nadie más'}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LiveRefresh seconds={15} />
            <ActionForm action={setThreadState.bind(null, org, thread.id, { starred: !thread.starred })}>
              <Button type="submit" aria-pressed={thread.starred}>
                <Star aria-hidden className={`size-4 ${thread.starred ? 'fill-sys-yellow text-sys-yellow' : ''}`} />
                {thread.starred ? 'Destacada' : 'Destacar'}
              </Button>
            </ActionForm>
            <ActionForm action={setThreadState.bind(null, org, thread.id, { read: false })}>
              <Button type="submit"><MailOpen aria-hidden className="size-4" />No leída</Button>
            </ActionForm>
            <ActionForm action={setThreadState.bind(null, org, thread.id, { archived: !thread.archived })}>
              <Button type="submit">
                {thread.archived ? <Inbox aria-hidden className="size-4" /> : <Archive aria-hidden className="size-4" />}
                {thread.archived ? 'A Recibidos' : 'Archivar'}
              </Button>
            </ActionForm>
          </div>
        }
      />
      <ol className="flex max-w-3xl flex-col gap-3">
        {thread.messages.map((m) => {
          const mine = m.senderId === ctx.userId;
          return (
            <li key={m.id} className="rounded-[var(--radius-card)] bg-sheet px-4 py-4 shadow-[var(--shadow-card)] md:px-5">
              <div className="mb-2 flex items-center gap-3">
                <span aria-hidden className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white ${mine ? 'bg-tint' : 'bg-gradient-to-b from-[#a1a1a6] to-[#6e6e73]'}`}>
                  {initials(m.senderName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{mine ? `${m.senderName} (tú)` : m.senderName}</span>
                  <span className="block text-[12px] text-ink-3">{longWhen(m.createdAt)}</span>
                </span>
              </div>
              <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{m.body}</p>
            </li>
          );
        })}
      </ol>
      <Cell title="Responder a todos" className="max-w-3xl">
        <ActionForm action={replyMessage.bind(null, org, thread.id)} className="flex flex-col gap-3" resetOnSuccess>
          <TextAreaField label="Mensaje" name="body" required rows={5} maxLength={20000} className="[&_label]:sr-only" />
          <div>
            <SubmitButton pendingLabel="Enviando…">Enviar respuesta</SubmitButton>
          </div>
        </ActionForm>
      </Cell>
    </>
  );
}
