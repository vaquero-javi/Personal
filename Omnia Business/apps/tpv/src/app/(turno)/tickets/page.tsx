import Link from 'next/link';
import { Printer } from 'lucide-react';
import { container } from '@/server/container';
import { requireShift } from '@/server/session';
import { formatEuro, formatTime } from '@/lib/format';

export const metadata = { title: 'Tickets · Omnia TPV' };

/** Últimos cobros de este terminal, para reimprimir. El histórico completo está en el backoffice (Facturación › Tickets TPV). */
export default async function TicketsPage() {
  const { ctx, terminal } = await requireShift();
  const tickets = await container().pos.recentTickets(ctx, terminal.terminalId);
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-lg font-bold">Últimos tickets de {terminal.terminalName}</h1>
        <p className="mb-4 text-sm text-ink-3">El histórico completo está en el backoffice: Facturación › Tickets TPV.</p>
        {tickets.length === 0 ? (
          <p className="rounded-lg bg-sheet-head p-4 text-sm text-ink-2">Aún no se ha cobrado nada en este terminal.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-shelf-edge bg-sheet">
            {tickets.map((t) => (
              <li key={t.invoiceId} className="flex items-center gap-4 px-4 py-3">
                <span className="w-14 text-sm text-ink-3">{formatTime(t.closedAt)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.fullNumber}</span>
                  <span className="block text-sm text-ink-3">
                    {t.tableName ? `Mesa ${t.tableName}` : t.label} · {t.method === 'card' ? 'Tarjeta' : 'Efectivo'}
                  </span>
                </span>
                <span className="text-lg font-bold">{formatEuro(t.total)}</span>
                <Link href={`/imprimir/ticket/${t.invoiceId}?volver=tickets`} className="flex size-11 items-center justify-center rounded-lg border border-shelf-edge hover:bg-sheet-head" aria-label={`Reimprimir ${t.fullNumber}`}>
                  <Printer className="size-5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
