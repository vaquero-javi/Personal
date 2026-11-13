import Link from 'next/link';
import { Printer } from 'lucide-react';
import { RefundButton } from '@/features/tickets/refund-button';
import { container } from '@/server/container';
import { requireShift } from '@/server/session';
import { formatEuro, formatTime } from '@/lib/format';

export const metadata = { title: 'Tickets · Omnia TPV' };

/**
 * Últimos cobros de este terminal, para reimprimir o devolver (solo encargados).
 * El histórico completo está en el backoffice (Facturación › Tickets TPV).
 */
export default async function TicketsPage() {
  const { ctx, terminal, can } = await requireShift();
  const canRefund = can('pos.manage');
  const tickets = await container().pos.recentTickets(ctx, terminal.terminalId);
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-[30px] leading-[1.1] font-bold tracking-[-0.022em]">Últimos tickets de {terminal.terminalName}</h1>
        <p className="mb-4 text-sm text-ink-3">El histórico completo está en el backoffice: Facturación › Tickets TPV.</p>
        {tickets.length === 0 ? (
          <p className="rounded-[16px] bg-fill p-4 text-[15px] text-ink-2">Aún no se ha cobrado nada en este terminal.</p>
        ) : (
          <ul className="divide-y divide-line-soft overflow-hidden rounded-[20px] bg-sheet shadow-[var(--shadow-card)]">
            {tickets.map((t) => (
              <li key={t.invoiceId} className="flex items-center gap-4 px-4 py-3">
                <span className="w-14 text-sm text-ink-3">{formatTime(t.closedAt)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.fullNumber}</span>
                  <span className="block text-sm text-ink-3">
                    {t.tableName ? `Mesa ${t.tableName}` : t.label} · {t.method === 'card' ? 'Tarjeta' : 'Efectivo'}
                  </span>
                </span>
                <span className="text-right">
                  <span className={`block text-lg font-bold ${t.refundId ? 'text-ink-3 line-through' : ''}`}>{formatEuro(t.total)}</span>
                  {t.refundId && (
                    <Link href={`/imprimir/ticket/${t.refundId}?volver=tickets`} className="block text-[13px] font-semibold text-danger underline-offset-2 hover:underline">
                      Devuelto · {t.refundNumber}
                    </Link>
                  )}
                </span>
                <Link href={`/imprimir/ticket/${t.invoiceId}?volver=tickets`} className="flex size-11 items-center justify-center rounded-lg border border-shelf-edge hover:bg-fill/70" aria-label={`Reimprimir ${t.fullNumber}`}>
                  <Printer className="size-5" aria-hidden />
                </Link>
                {canRefund && !t.refundId && <RefundButton invoiceId={t.invoiceId} fullNumber={t.fullNumber} total={t.total} method={t.method} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
