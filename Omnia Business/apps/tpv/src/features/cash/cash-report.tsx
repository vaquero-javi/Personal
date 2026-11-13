import type { CashMovement, CashMovementKind, CashSession } from '@omnia/pos/types';
import { formatDateTime, formatEuro, formatQty, formatTime } from '@/lib/format';
import { DENOMINATIONS, denominationLabel } from './denominations';

const movementLabel: Record<CashMovementKind, string> = {
  withdrawal: 'Retirada',
  deposit: 'Entrada',
  cash_to_card: 'Efectivo → tarjeta',
  card_to_cash: 'Tarjeta → efectivo',
};
/** Signo respecto al efectivo del cajón. */
const movementSign: Record<CashMovementKind, string> = { withdrawal: '−', deposit: '+', cash_to_card: '−', card_to_cash: '+' };

function Row({ label, value, strong = false, tone }: { label: string; value: string; strong?: boolean; tone?: 'ok' | 'danger' | 'warning' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : '';
  return (
    <div className={`flex justify-between gap-4 py-1.5 ${strong ? 'border-t border-line pt-2 font-bold' : ''}`}>
      <dt className={strong ? '' : 'text-ink-2'}>{label}</dt>
      <dd className={`text-right ${color}`}>{value}</dd>
    </div>
  );
}

/** Reporte X (caja abierta, en vivo) o Z (caja cerrada, congelado al cerrar). */
export function CashReport({ session, movements }: { session: CashSession; movements: CashMovement[] }) {
  const s = session.summary;
  const closed = session.status === 'closed';
  const diff = Number(session.difference ?? 0);
  const cardDiff = Number(session.cardDifference ?? 0);
  const transfers = Number(s.cashToCard) > 0 || Number(s.cardToCash) > 0;
  const tone = (d: number) => (d === 0 ? 'ok' : Math.abs(d) <= 1 ? 'warning' : 'danger');
  // Devoluciones (0044): los Z cerrados antes no las traen.
  const refunds = s.refunds ?? 0;
  const refundsCash = s.refundsCash ?? '0';
  const refundsCard = s.refundsCard ?? '0';
  return (
    <article className="rounded-[20px] bg-sheet shadow-[var(--shadow-card)] print:rounded-none print:shadow-none">
      <header className="border-b border-line px-5 py-4">
        <p className="text-[13px] font-medium text-ink-2">{closed ? 'Reporte Z · cierre de turno' : 'Reporte X · caja en curso'}</p>
        <h1 className="text-[24px] font-bold tracking-[-0.02em]">Caja nº {session.number} · {session.terminalName}</h1>
        <p className="mt-1 text-sm text-ink-2">
          Abierta {formatDateTime(session.openedAt)} por {session.openedByName}
          {closed && ` · cerrada ${formatDateTime(session.closedAt)} por ${session.closedByName}`}
        </p>
      </header>
      <div className="grid gap-px bg-line md:grid-cols-2">
        <section className="bg-sheet px-5 py-4">
          <h2 className="mb-2 text-[13px] font-semibold text-ink-3 uppercase">Efectivo</h2>
          <dl className="text-sm">
            <Row label="Fondo inicial" value={formatEuro(s.openingFloat)} />
            {transfers ? (
              <>
                <Row label="Cobrado en efectivo (TPV)" value={formatEuro(s.cashRecorded)} />
                {Number(s.cardToCash) > 0 && <Row label="Corregido de tarjeta a efectivo" value={`+${formatEuro(s.cardToCash)}`} />}
                {Number(s.cashToCard) > 0 && <Row label="Corregido de efectivo a tarjeta" value={`−${formatEuro(s.cashToCard)}`} />}
              </>
            ) : (
              <Row label="Ventas en efectivo" value={formatEuro(s.cashSales)} />
            )}
            {Number(refundsCash) > 0 && <Row label="Devoluciones en efectivo" value={`−${formatEuro(refundsCash)}`} tone="danger" />}
            <Row label="Entradas" value={formatEuro(s.deposits)} />
            <Row label="Retiradas" value={`−${formatEuro(s.withdrawals)}`} />
            <Row label="Efectivo esperado" value={formatEuro(closed ? session.expectedCash! : s.expectedCash)} strong />
            {closed && (
              <>
                <Row label="Efectivo contado" value={formatEuro(session.countedCash!)} />
                <Row label="Diferencia" value={`${diff > 0 ? '+' : ''}${formatEuro(diff)}`} strong tone={tone(diff)} />
              </>
            )}
          </dl>
        </section>
        <section className="bg-sheet px-5 py-4">
          <h2 className="mb-2 text-[13px] font-semibold text-ink-3 uppercase">Tarjeta</h2>
          <dl className="text-sm">
            <Row label="Cobrado con tarjeta (TPV)" value={formatEuro(s.cardRecorded)} />
            {Number(s.cashToCard) > 0 && <Row label="Corregido de efectivo a tarjeta" value={`+${formatEuro(s.cashToCard)}`} />}
            {Number(s.cardToCash) > 0 && <Row label="Corregido de tarjeta a efectivo" value={`−${formatEuro(s.cardToCash)}`} />}
            {Number(refundsCard) > 0 && <Row label="Devoluciones con tarjeta" value={`−${formatEuro(refundsCard)}`} tone="danger" />}
            <Row label="Tarjeta esperada (datáfono)" value={formatEuro(closed && session.expectedCard !== null ? session.expectedCard : s.expectedCard)} strong />
            {closed && session.countedCard !== null && (
              <>
                <Row label="Total del datáfono" value={formatEuro(session.countedCard)} />
                <Row label="Diferencia" value={`${cardDiff > 0 ? '+' : ''}${formatEuro(cardDiff)}`} strong tone={tone(cardDiff)} />
              </>
            )}
          </dl>
        </section>
        <section className="bg-sheet px-5 py-4">
          <h2 className="mb-2 text-[13px] font-semibold text-ink-3 uppercase">Ventas</h2>
          <dl className="text-sm">
            <Row label="Tickets" value={String(s.tickets)} />
            <Row label="Ticket medio" value={formatEuro(s.averageTicket)} />
            <Row label="Primer ticket" value={s.firstTicket ?? '—'} />
            <Row label="Último ticket" value={s.lastTicket ?? '—'} />
            <Row label="Tarjeta" value={formatEuro(s.cardSales)} />
            <Row label="Efectivo" value={formatEuro(s.cashSales)} />
            <Row label="Total vendido" value={formatEuro(s.totalSales)} strong />
            {refunds > 0 && (
              <>
                <Row label={`Devoluciones · ${refunds} ${refunds === 1 ? 'ticket' : 'tickets'}`} value={`−${formatEuro(s.refundsTotal ?? '0')}`} tone="danger" />
                <Row label="Total neto" value={formatEuro(s.netSales ?? s.totalSales)} strong />
              </>
            )}
            {s.cancelledTabs > 0 && <Row label="Cuentas anuladas" value={String(s.cancelledTabs)} tone="warning" />}
          </dl>
        </section>
        <section className="bg-sheet px-5 py-4">
          <h2 className="mb-2 text-[13px] font-semibold text-ink-3 uppercase">Impuestos</h2>
          {s.taxes.length === 0 ? (
            <p className="text-sm text-ink-3">Sin ventas.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-ink-3">
                <tr><th className="text-left font-semibold">Tipo</th><th className="text-right font-semibold">Base</th><th className="text-right font-semibold">Cuota</th></tr>
              </thead>
              <tbody>
                {s.taxes.map((t) => (
                  <tr key={t.rate}><td className="py-1">IVA {formatQty(t.rate)} %</td><td className="text-right">{formatEuro(t.base)}</td><td className="text-right">{formatEuro(t.tax)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="bg-sheet px-5 py-4">
          <h2 className="mb-2 text-[13px] font-semibold text-ink-3 uppercase">Por camarero</h2>
          {s.byWaiter.length === 0 ? (
            <p className="text-sm text-ink-3">Sin ventas.</p>
          ) : (
            <dl className="text-sm">
              {s.byWaiter.map((w) => <Row key={w.name} label={`${w.name} · ${w.tickets} tickets`} value={formatEuro(w.total)} />)}
            </dl>
          )}
        </section>
        <section className="bg-sheet px-5 py-4">
          <h2 className="mb-2 text-[13px] font-semibold text-ink-3 uppercase">Lo más vendido</h2>
          {s.topProducts.length === 0 ? (
            <p className="text-sm text-ink-3">Sin ventas.</p>
          ) : (
            <dl className="text-sm">
              {s.topProducts.map((p) => <Row key={p.name} label={`${formatQty(p.quantity)} × ${p.name}`} value={formatEuro(p.total)} />)}
            </dl>
          )}
        </section>
        {refunds > 0 && (
          <section className="bg-sheet px-5 py-4 md:col-span-2">
            <h2 className="mb-2 text-[13px] font-semibold text-ink-3 uppercase">Devoluciones</h2>
            <dl className="text-sm">
              {(s.refundList ?? []).map((r) => (
                <Row
                  key={r.number}
                  label={`${r.number}${r.originalNumber ? ` · devuelve ${r.originalNumber}` : ''} · ${r.method === 'card' ? 'tarjeta' : 'efectivo'} (${formatTime(r.at)})`}
                  value={`−${formatEuro(r.amount)}`}
                />
              ))}
              <Row label="Total devuelto" value={`−${formatEuro(s.refundsTotal ?? '0')}`} strong tone="danger" />
            </dl>
          </section>
        )}
        <section className="bg-sheet px-5 py-4 md:col-span-2">
          <h2 className="mb-2 text-[13px] font-semibold text-ink-3 uppercase">Movimientos de caja</h2>
          {movements.length === 0 ? (
            <p className="text-sm text-ink-3">Ninguno.</p>
          ) : (
            <dl className="text-sm">
              {movements.map((m) => (
                <Row key={m.id} label={`${movementLabel[m.kind]}${m.ticketNumber ? ` · ticket ${m.ticketNumber}` : ''}: ${m.reason} (${m.createdByName}, ${formatTime(m.createdAt)})`} value={`${movementSign[m.kind]}${formatEuro(m.amount)}`} />
              ))}
            </dl>
          )}
        </section>
        {closed && session.countDetail && (
          <section className="bg-sheet px-5 py-4 md:col-span-2">
            <h2 className="mb-2 text-[13px] font-semibold text-ink-3 uppercase">Arqueo</h2>
            <dl className="grid grid-cols-2 gap-x-8 text-sm sm:grid-cols-3">
              {DENOMINATIONS.filter((d) => session.countDetail![String(d)]).map((d) => (
                <Row key={d} label={`${session.countDetail![String(d)]} × ${denominationLabel(d)}`} value={formatEuro((session.countDetail![String(d)]! * d) / 100)} />
              ))}
            </dl>
            {session.notes && <p className="mt-2 text-sm text-ink-2">Notas: {session.notes}</p>}
          </section>
        )}
      </div>
    </article>
  );
}
