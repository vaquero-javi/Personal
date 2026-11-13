'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Banknote, CreditCard, LoaderCircle, Undo2 } from 'lucide-react';
import { Button, Modal, Notice } from '@/components/ui';
import { formatEuro } from '@/lib/format';
import { refundTicket } from '@/server/actions';

/**
 * Devolución de un ticket entero. El dinero sale de la caja abierta de este
 * terminal (efectivo o tarjeta, por defecto como se cobró) y se emite una
 * rectificativa que resta de la facturación. Al terminar, se imprime.
 */
export function RefundButton({ invoiceId, fullNumber, total, method }: { invoiceId: string; fullNumber: string; total: string; method: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [how, setHow] = useState<'cash' | 'card'>(method === 'card' ? 'card' : 'cash');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      setError(null);
      const r = await refundTicket({ invoiceId, method: how, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.push(`/imprimir/ticket/${r.data.invoiceId}?volver=tickets`);
    });

  const option = (value: 'cash' | 'card', label: string, Icon: typeof Banknote) => (
    <button
      type="button"
      role="radio"
      aria-checked={how === value}
      onClick={() => setHow(value)}
      className={`pressable flex h-14 flex-1 items-center justify-center gap-2 rounded-[14px] text-[16px] font-semibold ${how === value ? 'bg-tint text-on-tint' : 'bg-fill text-ink hover:bg-fill-strong'}`}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </button>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="flex size-11 items-center justify-center rounded-lg border border-shelf-edge text-danger hover:bg-fill/70"
        aria-label={`Devolver ${fullNumber}`}
        title="Devolver el ticket"
      >
        <Undo2 className="size-5" aria-hidden />
      </button>
      <Modal open={open} onClose={() => !pending && setOpen(false)} title="Devolver ticket">
        <div className="flex flex-col gap-4">
          <p className="text-[15px] text-ink-2">
            Se devuelve el ticket <b className="font-semibold text-ink">{fullNumber}</b> entero:{' '}
            <b className="font-semibold text-ink">{formatEuro(total)}</b>. Resta de la facturación y sale en el cierre Z como devolución.
          </p>
          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink-3 uppercase">Se devuelve en</p>
            <div role="radiogroup" aria-label="Forma de devolución" className="flex gap-2">
              {option('cash', 'Efectivo', Banknote)}
              {option('card', 'Tarjeta', CreditCard)}
            </div>
            {how === 'card' && <p className="mt-2 text-[13px] text-ink-3">Haz también la devolución en el datáfono por el mismo importe.</p>}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink-3 uppercase">Motivo (opcional)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="Producto en mal estado, cobro por error…"
              className="h-12 rounded-[12px] bg-fill px-3.5 text-[16px] outline-none focus:ring-[3px] focus:ring-tint/40"
            />
          </label>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex gap-2">
            <Button size="lg" className="flex-1" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button size="lg" variant="danger" className="flex-1" onClick={confirm} disabled={pending} aria-busy={pending}>
              {pending && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
              Devolver {formatEuro(total)}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
