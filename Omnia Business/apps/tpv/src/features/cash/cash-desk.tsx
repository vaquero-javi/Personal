'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Banknote, CreditCard, Minus, Plus } from 'lucide-react';
import type { CashMovement, CashSession, CashTicket } from '@omnia/pos/types';
import { Button, Modal, Notice, useFlash } from '@/components/ui';
import { formatDateTime, formatEuro, formatTime } from '@/lib/format';
import { addCashMovement, closeCash, openCash } from '@/server/actions';
import { CashReport } from './cash-report';
import { DENOMINATIONS, denominationLabel, isBill } from './denominations';

interface HistoryRow {
  id: string;
  number: number;
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  totalSales: string;
  difference: string | null;
}

const amountInput = 'h-12 w-full rounded-[12px] px-3.5 text-right text-lg font-semibold bg-fill outline-none focus:ring-[3px] focus:ring-tint/45';
const toDecimal = (text: string) => text.trim().replace(',', '.');

export function CashDesk({ terminalName, session, movements, tickets, history, openTabs }: {
  terminalName: string;
  session: CashSession | null;
  movements: CashMovement[];
  /** Tickets cobrados en la caja abierta, para corregir su forma de pago. */
  tickets: CashTicket[];
  history: HistoryRow[];
  openTabs: number;
}) {
  const router = useRouter();
  const [flash, show] = useFlash();
  const [pending, start] = useTransition();
  const [float, setFloat] = useState('150');
  const [move, setMove] = useState<{ kind: 'withdrawal' | 'deposit'; amount: string; reason: string } | null>(null);
  const [closing, setClosing] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const act = (work: () => Promise<{ ok: boolean; error?: string; message?: string }>, done?: () => void) =>
    start(async () => {
      const r = await work();
      if (!r.ok) return show(r.error ?? 'No se pudo hacer', 'danger');
      if (r.message) show(r.message);
      done?.();
      router.refresh();
    });

  if (!session) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-6">
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form
            className="flex flex-col gap-4 rounded-[20px] bg-sheet shadow-[var(--shadow-card)] p-5"
            onSubmit={(e) => {
              e.preventDefault();
              act(() => openCash(toDecimal(float)));
            }}
          >
            <div>
              <h1 className="text-[22px] font-bold tracking-[-0.02em]">Abrir caja · {terminalName}</h1>
              <p className="text-sm text-ink-3">Cuenta el cambio con el que empiezas el turno.</p>
            </div>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              Fondo de caja inicial (€)
              <input value={float} onChange={(e) => setFloat(e.target.value)} inputMode="decimal" className={amountInput} />
            </label>
            <div className="grid grid-cols-4 gap-2">
              {['100', '150', '200', '300'].map((v) => (
                <Button key={v} onClick={() => setFloat(v)} variant={float === v ? 'primary' : 'secondary'}>{v} €</Button>
              ))}
            </div>
            <Button type="submit" variant="primary" size="lg" disabled={pending || !/^\d+([.,]\d{1,2})?$/.test(float.trim())}>
              Abrir caja con {formatEuro(toDecimal(float) || 0)}
            </Button>
          </form>
          <History history={history} />
        </div>
        {flash}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={() => setMove({ kind: 'withdrawal', amount: '', reason: '' })}>
            <Minus className="size-5" aria-hidden /> Retirada
          </Button>
          <Button size="lg" onClick={() => setMove({ kind: 'deposit', amount: '', reason: '' })}>
            <Plus className="size-5" aria-hidden /> Entrada
          </Button>
          <Button size="lg" onClick={() => setTransferring(true)}>
            <ArrowLeftRight className="size-5" aria-hidden /> Corregir forma de pago
          </Button>
          <Link href={`/caja/${session.id}`} className="pressable inline-flex h-14 items-center rounded-[14px] bg-fill px-5 font-semibold text-tint hover:bg-fill-strong">
            Imprimir reporte X
          </Link>
          <Button size="lg" variant="primary" className="ml-auto" onClick={() => setClosing(true)}>
            Cerrar caja y arqueo
          </Button>
        </div>
        <CashReport session={session} movements={movements} />
      </div>

      <Modal open={move !== null} onClose={() => setMove(null)} title={move?.kind === 'withdrawal' ? 'Retirada de efectivo' : 'Entrada de efectivo'}>
        {move && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              act(() => addCashMovement(session.id, { ...move, amount: toDecimal(move.amount) }), () => setMove(null));
            }}
          >
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              Importe (€)
              <input value={move.amount} onChange={(e) => setMove({ ...move, amount: e.target.value })} inputMode="decimal" className={amountInput} autoFocus />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              Motivo
              <input value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })} maxLength={200} className="h-12 rounded-[12px] px-3.5 bg-fill outline-none focus:ring-[3px] focus:ring-tint/45 text-base font-normal text-ink" />
            </label>
            <div className="flex flex-wrap gap-2">
              {(move.kind === 'withdrawal' ? ['Pago a proveedor', 'Ingreso en banco', 'Compra de hielo'] : ['Cambio adicional']).map((r) => (
                <Button key={r} size="sm" onClick={() => setMove({ ...move, reason: r })}>{r}</Button>
              ))}
            </div>
            <Button type="submit" variant="primary" size="lg" disabled={pending || !move.amount || !move.reason.trim()}>Registrar</Button>
          </form>
        )}
      </Modal>

      <TransferDialog
        open={transferring}
        onClose={() => setTransferring(false)}
        tickets={tickets}
        cashSales={session.summary.cashSales}
        cardSales={session.summary.cardSales}
        busy={pending}
        onConfirm={(input) => act(() => addCashMovement(session.id, input), () => setTransferring(false))}
      />

      <CloseDialog
        open={closing}
        onClose={() => setClosing(false)}
        expected={session.summary.expectedCash}
        expectedCard={session.summary.expectedCard}
        openTabs={openTabs}
        busy={pending}
        onConfirm={(input) =>
          start(async () => {
            const r = await closeCash(session.id, input);
            if (!r.ok) return show(r.error, 'danger');
            router.push(`/caja/${r.data}`);
          })
        }
      />
      {flash}
    </div>
  );
}

function History({ history }: { history: HistoryRow[] }) {
  return (
    <section className="overflow-hidden rounded-[20px] bg-sheet shadow-[var(--shadow-card)]">
      <h2 className="px-5 pt-4 pb-2 text-[17px] font-semibold">Cierres anteriores</h2>
      {history.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-3">Todavía no hay cierres en este terminal.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {history.map((h) => {
            const diff = Number(h.difference ?? 0);
            return (
              <li key={h.id}>
                <Link href={`/caja/${h.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-fill/70">
                  <span>
                    <span className="block font-semibold">Caja nº {h.number}</span>
                    <span className="block text-xs text-ink-3">{formatDateTime(h.closedAt ?? h.openedAt)}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold">{formatEuro(h.totalSales)}</span>
                    {h.difference !== null && (
                      <span className={`block text-xs font-semibold ${diff === 0 ? 'text-ok' : 'text-danger'}`}>
                        {diff === 0 ? 'Cuadra' : `Descuadre ${diff > 0 ? '+' : ''}${formatEuro(diff)}`}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Arqueo: se cuentan billetes y monedas; la diferencia la confirma la base de datos al cerrar. */
function CloseDialog({ open, onClose, expected, expectedCard, openTabs, busy, onConfirm }: {
  open: boolean;
  onClose: () => void;
  expected: string;
  expectedCard: string;
  openTabs: number;
  busy: boolean;
  onConfirm: (input: { counted: string; countedCard: string; detail: Record<string, number>; notes?: string }) => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [card, setCard] = useState('');
  const [notes, setNotes] = useState('');
  const countedCents = DENOMINATIONS.reduce((s, d) => s + d * (counts[String(d)] ?? 0), 0);
  const diffCents = countedCents - Math.round(Number(expected) * 100);
  const cardValid = /^\d+([.,]\d{1,2})?$/.test(card.trim());
  const cardCents = cardValid ? Math.round(Number(toDecimal(card)) * 100) : 0;
  const cardDiffCents = cardCents - Math.round(Number(expectedCard) * 100);
  const set = (d: number, n: number) => setCounts((c) => ({ ...c, [String(d)]: Math.max(0, Math.min(100_000, n)) }));

  return (
    <Modal open={open} onClose={onClose} title="Cerrar caja · arqueo" wide>
      <div className="flex flex-col gap-4">
        {openTabs > 0 && <Notice tone="warning">Hay {openTabs} cuentas abiertas: hay que cobrarlas o anularlas antes de cerrar.</Notice>}
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <Banknote className="size-5 text-ink-3" aria-hidden /> Efectivo: cuenta billetes y monedas
        </h3>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {DENOMINATIONS.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <span className={`w-20 text-sm font-semibold ${isBill(d) ? '' : 'text-ink-2'}`}>{denominationLabel(d)}</span>
              <button type="button" className="pressable flex size-11 items-center justify-center rounded-full bg-fill text-tint hover:bg-fill-strong" aria-label={`Una ${denominationLabel(d)} menos`} onClick={() => set(d, (counts[String(d)] ?? 0) - 1)}>
                <Minus className="size-4" aria-hidden />
              </button>
              <input
                aria-label={`Cantidad de ${denominationLabel(d)}`}
                inputMode="numeric"
                value={counts[String(d)] ?? ''}
                onChange={(e) => set(d, Number(e.target.value.replace(/\D/g, '') || 0))}
                className="h-11 w-16 rounded-[12px] text-center bg-fill outline-none focus:ring-[3px] focus:ring-tint/45 text-base font-semibold"
              />
              <button type="button" className="pressable flex size-11 items-center justify-center rounded-full bg-fill text-tint hover:bg-fill-strong" aria-label={`Una ${denominationLabel(d)} más`} onClick={() => set(d, (counts[String(d)] ?? 0) + 1)}>
                <Plus className="size-4" aria-hidden />
              </button>
              <span className="ml-auto text-right text-sm text-ink-2">{formatEuro((d * (counts[String(d)] ?? 0)) / 100)}</span>
            </div>
          ))}
        </div>
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <CreditCard className="size-5 text-ink-3" aria-hidden /> Tarjeta: total del cierre del datáfono
        </h3>
        <label className="flex max-w-sm flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          Total cobrado con tarjeta según el datáfono (€)
          <input value={card} onChange={(e) => setCard(e.target.value)} inputMode="decimal" placeholder="0,00" className={amountInput} />
        </label>
        <div className="overflow-hidden rounded-[16px] bg-fill">
          <table className="w-full text-center">
            <thead className="text-[13px] font-medium text-ink-2">
              <tr>
                <th className="py-2 text-left pl-4 font-medium"> </th>
                <th className="py-2 font-medium">Facturado (TPV)</th>
                <th className="py-2 font-medium">Real</th>
                <th className="py-2 pr-4 font-medium">Diferencia</th>
              </tr>
            </thead>
            <tbody className="text-xl font-bold">
              {[
                ['Efectivo', expected, countedCents / 100, diffCents, true] as const,
                ['Tarjeta', expectedCard, cardCents / 100, cardDiffCents, cardValid] as const,
              ].map(([label, exp, real, diff, known]) => (
                <tr key={label} className="border-t border-line-soft">
                  <th scope="row" className="py-3 pl-4 text-left text-[15px] font-semibold">{label}</th>
                  <td className="py-3">{formatEuro(exp)}</td>
                  <td className="py-3">{known ? formatEuro(real) : '—'}</td>
                  <td className={`py-3 pr-4 ${!known ? 'text-ink-3' : diff === 0 ? 'text-ok' : 'text-danger'}`}>
                    {known ? `${diff > 0 ? '+' : ''}${formatEuro(diff / 100)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="-mt-2 text-xs text-ink-3">El efectivo esperado incluye el fondo inicial, las entradas y retiradas y las correcciones de forma de pago.</p>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          Notas del cierre
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Explica el descuadre si lo hay" className="h-11 rounded-[12px] px-3.5 bg-fill outline-none focus:ring-[3px] focus:ring-tint/45 text-base font-normal text-ink" />
        </label>
        <Button
          variant="primary"
          size="lg"
          disabled={busy || openTabs > 0 || !cardValid}
          onClick={() =>
            onConfirm({
              counted: (countedCents / 100).toFixed(2),
              countedCard: (cardCents / 100).toFixed(2),
              detail: Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0)),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            })
          }
        >
          {cardValid ? `Cerrar caja: ${formatEuro(countedCents / 100)} en efectivo y ${formatEuro(cardCents / 100)} en tarjeta` : 'Indica el total del datáfono para cerrar'}
        </Button>
      </div>
    </Modal>
  );
}

type Direction = 'card_to_cash' | 'cash_to_card';
const METHOD_LABEL = { cash: 'efectivo', card: 'tarjeta' } as const;

/**
 * Corregir la forma de pago: un cobro marcado con tarjeta que se pagó en
 * efectivo (o al revés). Se elige el ticket, o un importe suelto si no se sabe
 * cuál fue. Queda como movimiento de caja; el ticket fiscal no se toca.
 */
function TransferDialog({ open, onClose, tickets, cashSales, cardSales, busy, onConfirm }: {
  open: boolean;
  onClose: () => void;
  tickets: CashTicket[];
  cashSales: string;
  cardSales: string;
  busy: boolean;
  onConfirm: (input: { kind: Direction; amount: string; reason: string; invoiceId?: string }) => void;
}) {
  const [direction, setDirection] = useState<Direction>('card_to_cash');
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const from = direction === 'card_to_cash' ? 'card' : 'cash';
  const to = from === 'card' ? 'cash' : 'card';
  const available = from === 'card' ? cardSales : cashSales;
  const candidates = tickets.filter((t) => t.method === from && !t.corrected);
  const ticket = candidates.find((t) => t.invoiceId === ticketId) ?? null;
  const finalAmount = ticket ? ticket.total : toDecimal(amount);
  const amountValid = /^\d+(\.\d{1,2})?$/.test(finalAmount) && Number(finalAmount) > 0 && Number(finalAmount) <= Number(available);
  const defaultReason = `Cobrado en ${METHOD_LABEL[to]} y marcado como ${METHOD_LABEL[from]}`;

  const reset = (d: Direction) => {
    setDirection(d);
    setTicketId(null);
    setAmount('');
  };

  return (
    <Modal open={open} onClose={onClose} title="Corregir forma de pago" wide>
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Dirección del traspaso" className="grid gap-2 sm:grid-cols-2">
          {([
            ['card_to_cash', 'De tarjeta a efectivo', 'Se pagó en efectivo pero se marcó tarjeta'],
            ['cash_to_card', 'De efectivo a tarjeta', 'Se pagó con tarjeta pero se marcó efectivo'],
          ] as const).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={direction === value}
              onClick={() => reset(value)}
              className={`pressable flex flex-col items-start rounded-[14px] px-4 py-3 text-left ${direction === value ? 'bg-tint text-on-tint' : 'bg-fill text-ink hover:bg-fill-strong'}`}
            >
              <span className="flex items-center gap-2 text-[16px] font-semibold">
                {value === 'card_to_cash' ? <CreditCard className="size-5" aria-hidden /> : <Banknote className="size-5" aria-hidden />}
                <ArrowLeftRight className="size-4" aria-hidden />
                {value === 'card_to_cash' ? <Banknote className="size-5" aria-hidden /> : <CreditCard className="size-5" aria-hidden />}
                {label}
              </span>
              <span className={`text-[13px] ${direction === value ? 'opacity-90' : 'text-ink-3'}`}>{hint}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-[15px] font-semibold">¿Qué ticket fue? <span className="font-normal text-ink-3">Cobrados con {METHOD_LABEL[from]} en esta caja</span></h3>
          {candidates.length === 0 ? (
            <p className="rounded-[12px] bg-fill px-4 py-3 text-sm text-ink-3">No hay tickets cobrados con {METHOD_LABEL[from]} sin corregir. Puedes indicar un importe abajo.</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-[14px] bg-fill p-1.5">
              {candidates.map((t) => (
                <li key={t.invoiceId}>
                  <button
                    type="button"
                    aria-pressed={ticketId === t.invoiceId}
                    onClick={() => setTicketId(ticketId === t.invoiceId ? null : t.invoiceId)}
                    className={`pressable flex w-full items-center justify-between gap-3 rounded-[10px] px-3.5 py-2.5 text-left ${ticketId === t.invoiceId ? 'bg-tint text-on-tint' : 'hover:bg-fill-strong'}`}
                  >
                    <span>
                      <span className="block font-semibold">{t.tableName ?? 'Sin mesa'} · {t.fullNumber}</span>
                      <span className={`block text-xs ${ticketId === t.invoiceId ? 'opacity-90' : 'text-ink-3'}`}>{t.closedAt ? formatTime(t.closedAt) : ''}</span>
                    </span>
                    <span className="text-lg font-bold">{formatEuro(t.total)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!ticket && (
          <label className="flex max-w-sm flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            O un importe sin ticket (€)
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" className={amountInput} />
          </label>
        )}
        <p className="text-xs text-ink-3">Vendido con {METHOD_LABEL[from]} en esta caja: {formatEuro(available)}. No se puede pasar más.</p>

        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          Motivo
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder={defaultReason} className="h-12 rounded-[12px] px-3.5 bg-fill outline-none focus:ring-[3px] focus:ring-tint/45 text-base font-normal text-ink" />
        </label>

        <Button
          variant="primary"
          size="lg"
          disabled={busy || !amountValid}
          onClick={() =>
            onConfirm({
              kind: direction,
              amount: Number(finalAmount).toFixed(2),
              reason: reason.trim() || defaultReason,
              ...(ticket ? { invoiceId: ticket.invoiceId } : {}),
            })
          }
        >
          {amountValid ? `Pasar ${formatEuro(finalAmount)} de ${METHOD_LABEL[from]} a ${METHOD_LABEL[to]}` : 'Elige un ticket o escribe el importe'}
        </Button>
      </div>
    </Modal>
  );
}
