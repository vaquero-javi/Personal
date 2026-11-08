'use client';

import { useMemo, useState } from 'react';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { buildTicketLines, sumAmounts } from '@omnia/pos/pricing';
import type { CheckoutResult } from '@omnia/pos/types';
import { Modal } from '@/components/ui';
import { formatEuro, formatQty } from '@/lib/format';
import { checkout, checkoutSplit } from '@/server/actions';
import { CheckoutPanel } from './checkout-panel';
import type { LocalLine } from './use-tab-lines';

/** Importe de unas líneas con la misma aritmética que el ticket. */
const amounts = (lines: LocalLine[]) =>
  sumAmounts(buildTicketLines(lines.filter((l) => l.quantity > 0).map((l) => ({ ...l, quantity: String(l.quantity) }))));

/**
 * Dividir la cuenta: a la izquierda lo que queda en la mesa, a la derecha lo
 * que se cobra ahora. «>>» pasa una unidad de cada producto marcado; «<<» la
 * devuelve. Al cobrar, lo de la derecha sale de la cuenta.
 */
export function SplitDialog({ open, onClose, tabId, lines, disabledReason, onPaid, onError }: {
  open: boolean;
  onClose: () => void;
  tabId: string;
  lines: LocalLine[];
  disabledReason: string | null;
  onPaid: (r: CheckoutResult) => void;
  onError: (m: string) => void;
}) {
  // Unidades pasadas a la derecha, por línea.
  const [moved, setMoved] = useState<Record<string, number>>({});
  const [marked, setMarked] = useState<{ side: 'left' | 'right'; ids: Set<string> }>({ side: 'left', ids: new Set() });
  // Identifica el cobro: reintentar tras un corte no divide ni cobra dos veces.
  const [splitId, setSplitId] = useState(() => crypto.randomUUID());

  const left = useMemo(() => lines.map((l) => ({ ...l, quantity: l.quantity - (moved[l.id] ?? 0) })).filter((l) => l.quantity > 0), [lines, moved]);
  const right = useMemo(() => lines.map((l) => ({ ...l, quantity: moved[l.id] ?? 0 })).filter((l) => l.quantity > 0), [lines, moved]);
  const leftTotals = amounts(left);
  const rightTotals = amounts(right);
  const everything = left.length === 0;

  const reset = () => {
    setMoved({});
    setMarked({ side: 'left', ids: new Set() });
    setSplitId(crypto.randomUUID());
  };
  const close = () => {
    reset();
    onClose();
  };

  const toggle = (side: 'left' | 'right', id: string) =>
    setMarked((m) => {
      const ids = new Set(m.side === side ? m.ids : []);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { side, ids };
    });

  /** Una unidad de cada marcado al otro lado; lo que se agota deja de estar marcado. */
  const shift = (from: 'left' | 'right') => {
    if (marked.side !== from || marked.ids.size === 0) return;
    const source = from === 'left' ? left : right;
    const next = { ...moved };
    const ids = new Set(marked.ids);
    for (const l of source) {
      if (!ids.has(l.id)) continue;
      next[l.id] = (next[l.id] ?? 0) + (from === 'left' ? 1 : -1);
      if (l.quantity === 1) ids.delete(l.id);
    }
    setMoved(next);
    setMarked({ side: from, ids });
  };

  return (
    <Modal open={open} onClose={close} title="Dividir ticket" wide="xl">
      <div className="grid min-h-[60dvh] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4">
        <Column
          title="En la cuenta"
          lines={left}
          marked={marked.side === 'left' ? marked.ids : null}
          onToggle={(id) => toggle('left', id)}
          empty="Todo pasa a este cobro."
          footer={
            <div className="flex items-end justify-between border-t border-line px-4 py-3">
              <p className="text-[13px] font-medium text-ink-2">Queda en la cuenta</p>
              <p className="text-3xl font-bold">{formatEuro(leftTotals.total)}</p>
            </div>
          }
        />

        <div className="flex flex-col items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => shift('left')}
            disabled={marked.side !== 'left' || marked.ids.size === 0}
            aria-label="Pasar al cobro"
            className="pressable flex size-16 items-center justify-center rounded-full bg-tint text-on-tint disabled:opacity-30"
          >
            <ChevronsRight className="size-8" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => shift('right')}
            disabled={marked.side !== 'right' || marked.ids.size === 0}
            aria-label="Devolver a la cuenta"
            className="pressable flex size-16 items-center justify-center rounded-full bg-fill text-tint disabled:opacity-30"
          >
            <ChevronsLeft className="size-8" aria-hidden />
          </button>
        </div>

        <Column
          title="A cobrar ahora"
          lines={right}
          marked={marked.side === 'right' ? marked.ids : null}
          onToggle={(id) => toggle('right', id)}
          empty="Marca productos a la izquierda y pulsa >>."
          footer={
            <CheckoutPanel
              tabId={tabId}
              total={rightTotals.total}
              tax={rightTotals.tax}
              label="A cobrar"
              disabledReason={disabledReason ?? (right.length === 0 ? 'Pasa algún producto a este lado' : null)}
              // Si pasa todo, es un cobro normal de la cuenta entera.
              pay={(input) =>
                everything
                  ? checkout({ tabId, ...input })
                  : checkoutSplit({ tabId, splitId, items: right.map((l) => ({ lineId: l.id, quantity: l.quantity })), ...input })
              }
              onPaid={(r) => {
                reset();
                onPaid(r);
              }}
              onError={onError}
            />
          }
        />
      </div>
    </Modal>
  );
}

function Column({ title, lines, marked, onToggle, empty, footer }: {
  title: string;
  lines: LocalLine[];
  marked: Set<string> | null;
  onToggle: (id: string) => void;
  empty: string;
  footer: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-h-0 flex-col overflow-hidden rounded-[16px] bg-sheet shadow-[var(--shadow-card)]">
      <h3 className="border-b border-line-soft px-4 py-2.5 text-[13px] font-semibold text-ink-3 uppercase">{title}</h3>
      <ul className="min-h-0 flex-1 divide-y divide-line-soft overflow-y-auto">
        {lines.length === 0 && <li className="p-6 text-center text-sm text-ink-3">{empty}</li>}
        {lines.map((l) => {
          const on = marked?.has(l.id) ?? false;
          return (
            <li key={l.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(l.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left aria-pressed:bg-tint-soft aria-pressed:text-tint"
              >
                <span className="w-8 text-center text-base font-bold">{formatQty(l.quantity)}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{l.description}</span>
                <span className="font-bold">{formatEuro(amounts([l]).total)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {footer}
    </section>
  );
}
