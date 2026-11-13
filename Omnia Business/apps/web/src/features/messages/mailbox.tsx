import Link from 'next/link';
import { Inbox, Star } from 'lucide-react';
import type { Mailbox as Box } from '@omnia/messages';
import { Cell, EmptyState, PageHeader } from '@/components/ui/layout';
import { LinkButton } from '@/components/ui/button';
import { LiveRefresh } from '@/features/stats/live-refresh';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { shortWhen } from './when';

const TITLES: Record<Box, { title: string; empty: string; hint: string }> = {
  inbox: { title: 'Recibidos', empty: 'No tienes mensajes', hint: 'Aquí llegan las conversaciones en las que participas. Las archivadas vuelven aquí en cuanto alguien responde.' },
  starred: { title: 'Destacados', empty: 'Nada destacado', hint: 'Pulsa la estrella de una conversación para tenerla a mano aquí.' },
  sent: { title: 'Enviados', empty: 'Aún no has escrito a nadie', hint: 'Las conversaciones en las que has escrito algún mensaje.' },
  archived: { title: 'Archivados', empty: 'No hay nada archivado', hint: 'Lo que archivas sale de Recibidos sin borrarse.' },
};

/** Lista de conversaciones de una bandeja, al estilo de un correo. */
export async function Mailbox({ org, box }: { org: string; box: Box }) {
  const { ctx } = await requireOrg(org);
  const threads = await container().messages.list(ctx, box);
  const copy = TITLES[box];
  const unread = threads.filter((t) => t.unread).length;
  return (
    <>
      <PageHeader
        title={copy.title}
        description={box === 'inbox' ? (unread ? `${unread} sin leer` : 'Todo leído') : copy.hint}
        actions={
          <div className="flex items-center gap-2">
            <LiveRefresh seconds={20} />
            <LinkButton href={`/o/${org}/mensajes/nuevo`} variant="primary">Redactar</LinkButton>
          </div>
        }
      />
      <Cell className="!px-0 !py-0 md:!px-0">
        {threads.length === 0 ? (
          <div className="px-4 py-2 md:px-5">
            <EmptyState title={copy.empty}>{copy.hint}</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/o/${org}/mensajes/c/${t.id}`}
                  className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3 transition-colors hover:bg-fill/60 md:px-5 ${t.unread ? '' : 'text-ink-2'}`}
                >
                  <span aria-hidden className={`size-2 rounded-full ${t.unread ? 'bg-tint' : 'bg-transparent'}`} />
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className={`truncate text-[15px] ${t.unread ? 'font-bold text-ink' : 'font-medium'}`}>
                      {box === 'sent' ? `Para: ${t.otherNames.join(', ')}` : t.lastSenderName}
                    </span>
                    {t.messageCount > 1 && <span className="shrink-0 text-[12px] text-ink-3">{t.messageCount}</span>}
                    {t.starred && <Star aria-label="Destacada" className="size-3.5 shrink-0 fill-sys-yellow text-sys-yellow" />}
                    {box !== 'archived' && t.archived && <Inbox aria-label="Archivada" className="size-3.5 shrink-0 text-ink-3" />}
                  </span>
                  <span className={`text-[12px] tabular-nums ${t.unread ? 'font-semibold text-tint' : 'text-ink-3'}`}>{shortWhen(t.lastMessageAt)}</span>
                  <span className="col-start-2 col-end-4 min-w-0 truncate text-[14px]">
                    <span className={t.unread ? 'font-semibold text-ink' : 'text-ink'}>{t.subject}</span>
                    <span className="text-ink-3"> — {t.snippet}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Cell>
      <p className="text-[12px] text-ink-3">
        Solo quienes participan en una conversación pueden leerla; ni la dirección ni un administrador ven mensajes ajenos. Los mensajes no se editan ni se borran.
      </p>
    </>
  );
}
