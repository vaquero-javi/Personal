'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Minus, Plus } from 'lucide-react';
import type { CashMovement, CashSession } from '@omnia/pos/types';
import { Button, Modal, Notice, useFlash } from '@/components/ui';
import { formatDateTime, formatEuro } from '@/lib/format';
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

const amountInput = 'h-12 w-full rounded-lg border border-shelf-edge px-3 text-right text-lg font-semibold';
const toDecimal = (text: string) => text.trim().replace(',', '.');

export function CashDesk({ terminalName, session, movements, history, openTabs }: {
  terminalName: string;
  session: CashSession | null;
  movements: CashMovement[];
  history: HistoryRow[];
  openTabs: number;
}) {
  const router = useRouter();
  const [flash, show] = useFlash();
  const [pending, start] = useTransition();
  const [float, setFloat] = useState('150');
  const [move, setMove] = useState<{ kind: 'withdrawal' | 'deposit'; amount: string; reason: string } | null>(null);
  const [closing, setClosing] = useState(false);

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
            className="flex flex-col gap-4 rounded-xl border border-shelf-edge bg-sheet p-5"
            onSubmit={(e) => {
              e.preventDefault();
              act(() => openCash(toDecimal(float)));
            }}
          >
            <div>
              <h1 className="text-lg font-bold">Abrir caja · {terminalName}</h1>
              <p className="text-sm text-ink-3">Cuenta el cambio con el que empiezas el turno.</p>
            </div>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-3">
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
          <Link href={`/caja/${session.id}`} className="inline-flex h-14 items-center rounded-lg border border-shelf-edge bg-sheet px-5 font-semibold hover:bg-sheet-head">
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
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-3">
              Importe (€)
              <input value={move.amount} onChange={(e) => setMove({ ...move, amount: e.target.value })} inputMode="decimal" className={amountInput} autoFocus />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-3">
              Motivo
              <input value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })} maxLength={200} className="h-12 rounded-lg border border-shelf-edge px-3 text-base font-normal text-ink" />
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

      <CloseDialog
        open={closing}
        onClose={() => setClosing(false)}
        expected={session.summary.expectedCash}
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
    <section className="rounded-xl border border-shelf-edge bg-sheet">
      <h2 className="border-b border-line px-5 py-3 text-sm font-bold">Cierres anteriores</h2>
      {history.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-3">Todavía no hay cierres en este terminal.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {history.map((h) => {
            const diff = Number(h.difference ?? 0);
            return (
              <li key={h.id}>
                <Link href={`/caja/${h.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-sheet-head">
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
function CloseDialog({ open, onClose, expected, openTabs, busy, onConfirm }: {
  open: boolean;
  onClose: () => void;
  expected: string;
  openTabs: number;
  busy: boolean;
  onConfirm: (input: { counted: string; detail: Record<string, number>; notes?: string }) => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const countedCents = DENOMINATIONS.reduce((s, d) => s + d * (counts[String(d)] ?? 0), 0);
  const diffCents = countedCents - Math.round(Number(expected) * 100);
  const set = (d: number, n: number) => setCounts((c) => ({ ...c, [String(d)]: Math.max(0, Math.min(100_000, n)) }));

  return (
    <Modal open={open} onClose={onClose} title="Cerrar caja · arqueo" wide>
      <div className="flex flex-col gap-4">
        {openTabs > 0 && <Notice tone="warning">Hay {openTabs} cuentas abiertas: hay que cobrarlas o anularlas antes de cerrar.</Notice>}
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {DENOMINATIONS.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <span className={`w-20 text-sm font-semibold ${isBill(d) ? '' : 'text-ink-2'}`}>{denominationLabel(d)}</span>
              <button type="button" className="flex size-11 items-center justify-center rounded-lg border border-shelf-edge" aria-label={`Una ${denominationLabel(d)} menos`} onClick={() => set(d, (counts[String(d)] ?? 0) - 1)}>
                <Minus className="size-4" aria-hidden />
              </button>
              <input
                aria-label={`Cantidad de ${denominationLabel(d)}`}
                inputMode="numeric"
                value={counts[String(d)] ?? ''}
                onChange={(e) => set(d, Number(e.target.value.replace(/\D/g, '') || 0))}
                className="h-11 w-16 rounded-lg border border-shelf-edge text-center text-base font-semibold"
              />
              <button type="button" className="flex size-11 items-center justify-center rounded-lg border border-shelf-edge" aria-label={`Una ${denominationLabel(d)} más`} onClick={() => set(d, (counts[String(d)] ?? 0) + 1)}>
                <Plus className="size-4" aria-hidden />
              </button>
              <span className="ml-auto text-right text-sm text-ink-2">{formatEuro((d * (counts[String(d)] ?? 0)) / 100)}</span>
            </div>
          ))}
        </div>
        <dl className="grid grid-cols-3 gap-3 rounded-xl bg-sheet-head p-4 text-center">
          <div>
            <dt className="text-xs font-semibold text-ink-3">Contado</dt>
            <dd className="text-2xl font-bold">{formatEuro(countedCents / 100)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-ink-3">Esperado</dt>
            <dd className="text-2xl font-bold">{formatEuro(expected)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-ink-3">Diferencia</dt>
            <dd className={`text-2xl font-bold ${diffCents === 0 ? 'text-ok' : 'text-danger'}`}>
              {diffCents > 0 ? '+' : ''}
              {formatEuro(diffCents / 100)}
            </dd>
          </div>
        </dl>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-3">
          Notas del cierre
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Explica el descuadre si lo hay" className="h-11 rounded-lg border border-shelf-edge px-3 text-base font-normal text-ink" />
        </label>
        <Button
          variant="primary"
          size="lg"
          disabled={busy || openTabs > 0}
          onClick={() =>
            onConfirm({
              counted: (countedCents / 100).toFixed(2),
              detail: Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0)),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            })
          }
        >
          Cerrar caja con {formatEuro(countedCents / 100)} contados
        </Button>
      </div>
    </Modal>
  );
}
