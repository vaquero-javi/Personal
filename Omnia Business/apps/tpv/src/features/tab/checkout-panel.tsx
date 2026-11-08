'use client';

import { useState, useTransition } from 'react';
import { Banknote, CreditCard, Delete, Split } from 'lucide-react';
import type { CheckoutResult } from '@omnia/pos/types';
import { Button } from '@/components/ui';
import { formatEuro } from '@/lib/format';
import { checkout } from '@/server/actions';

const BILLS = [5, 10, 20, 50] as const;
// Teclado en dos filas de seis: cabe bajo la cuenta sin taparla.
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', ',', 'del'] as const;

/** Céntimos a partir de texto con coma («12,5» → 1250). */
const toCents = (text: string) => {
  if (!text) return 0;
  const [int = '0', frac = ''] = text.split(',');
  return Number(int || '0') * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
};

type Pay = (input: { method: 'cash' | 'card'; tendered?: string }) => ReturnType<typeof checkout>;

/**
 * Cobro rápido: tarjeta en dos toques; efectivo con billetes rápidos o
 * teclado y el cambio calculado al momento. Con `pay` cobra otra cosa que la
 * cuenta entera (una parte dividida); con `onSplit` ofrece dividirla.
 */
export function CheckoutPanel({ tabId, total, tax, disabledReason, onPaid, onError, pay: payWith, onSplit, label = 'Total' }: {
  tabId: string;
  total: string;
  tax: string;
  disabledReason: string | null;
  onPaid: (r: CheckoutResult) => void;
  onError: (m: string) => void;
  pay?: Pay;
  onSplit?: () => void;
  label?: string;
}) {
  const [method, setMethod] = useState<'card' | 'cash' | null>(null);
  const [tendered, setTendered] = useState('');
  const [keypad, setKeypad] = useState(false);
  const [pending, start] = useTransition();
  const totalCents = Math.round(Number(total) * 100);
  const tenderedCents = toCents(tendered);
  const changeCents = tenderedCents - totalCents;
  const cashReady = method === 'cash' && (tendered === '' || changeCents >= 0);

  const press = (k: (typeof KEYS)[number]) =>
    setTendered((t) => {
      if (k === 'del') return t.slice(0, -1);
      if (k === ',') return t.includes(',') ? t : `${t || '0'},`;
      const [, frac] = t.split(',');
      if (frac !== undefined && frac.length >= 2) return t;
      if (t.replace(',', '').length >= 7) return t;
      return t === '0' ? k : t + k;
    });

  const pay = () =>
    start(async () => {
      const amount = method === 'cash' && tendered ? (tenderedCents / 100).toFixed(2) : undefined;
      // El cobro es idempotente por cuenta: ante un corte se reintenta sin riesgo de cobrar dos veces.
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const input = { method: method!, ...(amount ? { tendered: amount } : {}) };
          const result = await (payWith ? payWith(input) : checkout({ tabId, ...input }));
          if (result.ok) {
            setMethod(null);
            setTendered('');
            setKeypad(false);
            onPaid(result.data);
          } else onError(result.error);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
        }
      }
      onError('Sin conexión con el servidor: el cobro no se ha registrado. Inténtalo de nuevo.');
    });

  return (
    <div className="material border-t border-line-soft">
      <div className="flex items-end justify-between px-4 pt-3">
        <div>
          <p className="text-[13px] font-medium text-ink-2">{label}</p>
          <p className="text-xs text-ink-3">IVA incluido ({formatEuro(tax)})</p>
        </div>
        <p className="text-[40px] leading-none font-bold tracking-[-0.03em]">{formatEuro(total)}</p>
      </div>

      {disabledReason && <p className="px-4 pt-2 text-right text-sm font-semibold text-warning">{disabledReason}</p>}

      <div className={`grid gap-3 p-3 ${onSplit ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Button size="xl" variant={method === 'card' ? 'primary' : 'secondary'} disabled={!!disabledReason || pending} onClick={() => setMethod(method === 'card' ? null : 'card')} aria-pressed={method === 'card'}>
          <CreditCard className="size-6" aria-hidden /> Tarjeta
        </Button>
        <Button size="xl" variant={method === 'cash' ? 'primary' : 'secondary'} disabled={!!disabledReason || pending} onClick={() => setMethod(method === 'cash' ? null : 'cash')} aria-pressed={method === 'cash'}>
          <Banknote className="size-6" aria-hidden /> Efectivo
        </Button>
        {onSplit && (
          <Button size="xl" disabled={!!disabledReason || pending} onClick={onSplit}>
            <Split className="size-6" aria-hidden /> Dividir ticket
          </Button>
        )}
      </div>

      {method === 'cash' && (
        <div className="flex flex-col gap-2 border-t border-line-soft px-3 py-3">
          <div className="grid grid-cols-6 gap-2">
            {BILLS.map((b) => (
              <Button key={b} size="lg" onClick={() => { setTendered(String(b)); setKeypad(false); }} variant={tendered === String(b) ? 'primary' : 'secondary'} className="px-0 text-lg">
                {b} €
              </Button>
            ))}
            <Button size="lg" className="px-0" onClick={() => { setTendered(total.replace('.', ',')); setKeypad(false); }}>Justo</Button>
            <Button size="lg" className="px-0" variant={keypad ? 'primary' : 'secondary'} onClick={() => { setKeypad(!keypad); setTendered(''); }} aria-expanded={keypad}>
              Otro
            </Button>
          </div>
          {keypad && (
            <div className="grid grid-cols-6 gap-2" aria-label="Teclado del importe entregado">
              {KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => press(k)}
                  aria-label={k === 'del' ? 'Borrar' : k === ',' ? 'Coma decimal' : k}
                  className="pressable flex h-12 items-center justify-center rounded-[12px] bg-fill text-xl font-semibold hover:bg-fill-strong"
                >
                  {k === 'del' ? <Delete className="size-5" aria-hidden /> : k}
                </button>
              ))}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-3">
            <div className="flex items-baseline justify-between gap-2 rounded-[12px] bg-fill px-3.5 py-2.5">
              <dt className="text-sm text-ink-3">Entregado</dt>
              <dd className="text-2xl font-bold">{tendered ? formatEuro(tenderedCents / 100) : '—'}</dd>
            </div>
            <div className={`flex items-baseline justify-between gap-2 rounded-[12px] px-3.5 py-2.5 ${tendered && changeCents < 0 ? 'bg-danger-soft' : 'bg-ok-soft'}`}>
              <dt className="text-sm text-ink-3">{tendered && changeCents < 0 ? 'Faltan' : 'Cambio'}</dt>
              <dd className={`text-2xl font-bold ${tendered && changeCents < 0 ? 'text-danger' : 'text-ok'}`} aria-live="polite">
                {!tendered ? '—' : formatEuro(Math.abs(changeCents) / 100)}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {method && (
        <div className="px-3 pb-3">
          <Button size="xl" variant="ok" className="w-full" disabled={pending || !!disabledReason || (method === 'cash' && !cashReady)} onClick={pay}>
            {pending ? 'Cobrando…' : method === 'card' ? `Cobrar ${formatEuro(total)} con tarjeta` : `Cobrar ${formatEuro(total)} en efectivo`}
          </Button>
        </div>
      )}
    </div>
  );
}
