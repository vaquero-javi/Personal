'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildTicketLines, sumAmounts } from '@omnia/pos/pricing';
import type { MenuProduct, TabDetail } from '@omnia/pos/types';
import { setLineQuantity } from '@/server/actions';

export interface LocalLine {
  id: string;
  itemId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  taxRate: string;
  discountPct: string;
  note: string | null;
  sentAt: Date | null;
}

const fromServer = (tab: TabDetail): LocalLine[] =>
  tab.lines.map((l) => ({ ...l, quantity: Number(l.quantity) }));

/** Total y PVP de cada línea con la misma aritmética que el ticket. */
export function lineTotals(line: LocalLine) {
  const src = { ...line, quantity: String(line.quantity) };
  return {
    unitGross: sumAmounts(buildTicketLines([{ ...src, quantity: '1' }])).total,
    total: sumAmounts(buildTicketLines([src])).total,
  };
}

/**
 * Líneas de la cuenta con respuesta inmediata: cada toque cambia el estado local
 * y se envía en orden al servidor como «cantidad = N» (idempotente: reintentar
 * tras un corte no duplica). Cuando no queda nada pendiente se vuelve a leer la
 * cuenta del servidor, que manda.
 */
export function useTabLines(tab: TabDetail, onError: (message: string) => void) {
  const router = useRouter();
  // Fuente de verdad síncrona: varios toques seguidos antes de volver a pintar
  // ven siempre la cantidad ya sumada.
  const linesRef = useRef<LocalLine[]>(fromServer(tab));
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [pending, setPending] = useState(0);
  const [offline, setOffline] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const inFlight = useRef(0);

  const commit = useCallback((next: LocalLine[]) => {
    linesRef.current = next;
    rerender();
  }, []);

  // Datos frescos del servidor: se aceptan solo si no hay cambios en vuelo.
  useEffect(() => {
    if (inFlight.current === 0) commit(fromServer(tab));
  }, [tab, commit]);

  const send = useCallback(
    (input: { lineId: string; itemId: string; quantity: number }) => {
      inFlight.current++;
      setPending((n) => n + 1);
      queue.current = queue.current
        .then(async () => {
          for (let attempt = 0; ; attempt++) {
            try {
              const result = await setLineQuantity({ ...input, tabId: tab.id });
              setOffline(false);
              if (!result.ok) onError(result.error);
              return;
            } catch {
              // Sin conexión: reintenta con espera creciente (máx. 30 s entre intentos).
              setOffline(true);
              await new Promise((r) => setTimeout(r, Math.min(30_000, 500 * 2 ** attempt)));
            }
          }
        })
        .finally(() => {
          inFlight.current--;
          setPending((n) => n - 1);
          if (inFlight.current === 0) router.refresh();
        });
    },
    [tab.id, onError, router],
  );

  const setQuantity = useCallback(
    (lineId: string, quantity: number) => {
      const line = linesRef.current.find((l) => l.id === lineId);
      if (!line) return;
      const q = Math.max(0, quantity);
      commit(q === 0 ? linesRef.current.filter((l) => l.id !== lineId) : linesRef.current.map((l) => (l.id === lineId ? { ...l, quantity: q } : l)));
      send({ lineId, itemId: line.itemId, quantity: q });
    },
    [commit, send],
  );

  /** Suma una unidad a la línea sin enviar del mismo producto, o abre una línea nueva. */
  const addProduct = useCallback(
    (p: MenuProduct) => {
      const ls = linesRef.current;
      const existing = ls.find((l) => l.itemId === p.itemId && !l.sentAt && Number(l.discountPct) === 0 && !l.note);
      if (existing) {
        setQuantity(existing.id, existing.quantity + 1);
        return;
      }
      const line: LocalLine = {
        id: crypto.randomUUID(),
        itemId: p.itemId,
        description: p.name,
        quantity: 1,
        unitPrice: p.unitPrice,
        taxRate: p.taxRate,
        discountPct: '0.00',
        note: null,
        sentAt: null,
      };
      commit([...ls, line]);
      send({ lineId: line.id, itemId: p.itemId, quantity: 1 });
    },
    [commit, send, setQuantity],
  );

  const lines = linesRef.current;
  const totals = sumAmounts(buildTicketLines(lines.map((l) => ({ ...l, quantity: String(l.quantity) }))));
  return { lines, setQuantity, addProduct, totals, pending, offline };
}
