'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Delete, LockKeyhole, Unlink } from 'lucide-react';
import type { PosStaffMember } from '@omnia/pos/types';
import { BrandLoop } from '@/components/brand-loop';
import { Button, Modal, Notice } from '@/components/ui';
import { formatTime, initials } from '@/lib/format';
import { unlock, unpairTerminal } from '@/server/actions';
import { ClockDialog } from './clock-dialog';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'] as const;

export function LockScreen({ orgName, terminalName, staff }: { orgName: string; terminalName: string; staff: PosStaffMember[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<PosStaffMember | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [now, setNow] = useState<Date | null>(null);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const [unpairing, startUnpair] = useTransition();
  const [clocking, setClocking] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const submit = (value: string) => {
    if (!selected || value.length < 4 || pending) return;
    setError(null);
    start(async () => {
      const result = await unlock(selected.userId, value);
      if (result.ok) {
        router.replace('/mesas');
      } else {
        setError(result.error);
        setPin('');
      }
    });
  };

  const press = (key: (typeof KEYS)[number]) => {
    if (key === 'del') return setPin((p) => p.slice(0, -1));
    if (key === 'ok') return submit(pin);
    const next = (pin + key).slice(0, 6);
    setPin(next);
    if (next.length === 6) submit(next);
  };

  // Teclado físico (tablet con teclado o pruebas en escritorio).
  useEffect(() => {
    if (!selected || confirmUnpair || clocking) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter') press('ok');
      else if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr] md:grid-cols-[minmax(0,1fr)_26rem] md:grid-rows-1">
      <section className="flex flex-col gap-6 p-5 md:p-8">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink-3">{terminalName}</p>
            <h1 className="text-2xl font-bold">{orgName}</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button size="lg" variant="primary" onClick={() => setClocking(true)}>
              <Clock className="size-5" aria-hidden /> Fichar con tarjeta
            </Button>
            <p className="text-3xl font-bold tabular-nums" suppressHydrationWarning>
              {now ? formatTime(now) : ''}
            </p>
          </div>
        </header>
        <div>
          <h2 className="mb-3 text-sm font-bold">¿Quién eres?</h2>
          {staff.length === 0 ? (
            <Notice tone="warning">Nadie puede usar este terminal todavía: en Ajustes › Roles da el permiso «Usar el TPV» a un rol, y asigna PIN en Ajustes › TPV.</Notice>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {staff.map((s) => {
                const active = selected?.userId === s.userId;
                return (
                  <li key={s.userId}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(s);
                        setPin('');
                        setError(null);
                      }}
                      aria-pressed={active}
                      className={`flex h-full min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition-colors ${
                        active ? 'border-ink bg-ink text-white' : 'border-shelf-edge bg-sheet hover:bg-sheet-head'
                      }`}
                    >
                      <span className={`flex size-14 items-center justify-center rounded-full text-lg font-bold ${active ? 'bg-white text-ink' : 'bg-ink text-white'}`}>
                        {initials(s.fullName)}
                      </span>
                      <span className="font-semibold leading-tight">{s.fullName}</span>
                      <span className={`text-xs ${active ? 'text-white/80' : 'text-ink-3'}`}>
                        {s.roleName}
                        {!s.hasPin && ' · sin PIN'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {/* La marca, centrada en el hueco gris bajo el personal. */}
        <div aria-hidden className="flex flex-1 items-center justify-center">
          <BrandLoop className="w-[min(70%,28rem)]" />
        </div>
      </section>

      <section aria-label="Teclado de PIN" className="flex flex-col gap-5 border-t border-shelf-edge bg-sheet p-5 md:border-t-0 md:border-l md:p-8">
        <div className="my-auto flex flex-col gap-5">
          {selected ? (
            <>
              <div className="text-center">
                <p className="text-sm text-ink-3">PIN de</p>
                <p className="text-xl font-bold">{selected.fullName}</p>
              </div>
              <div className="flex justify-center gap-3" aria-live="polite" aria-label={`${pin.length} cifras tecleadas`}>
                {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
                  <span key={i} className={`size-4 rounded-full border-2 border-ink ${i < pin.length ? 'bg-ink' : ''}`} />
                ))}
              </div>
              {error && <Notice tone="danger" className="text-center">{error}</Notice>}
              <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-3">
                {KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={pending || (k === 'ok' && pin.length < 4)}
                    onClick={() => press(k)}
                    aria-label={k === 'del' ? 'Borrar' : k === 'ok' ? 'Entrar' : k}
                    className={`flex h-18 items-center justify-center rounded-xl text-2xl font-semibold transition-colors disabled:opacity-40 ${
                      k === 'ok' ? 'bg-ink text-base text-white hover:bg-[#2c3038]' : 'border border-shelf-edge bg-sheet hover:bg-sheet-head active:bg-line-soft'
                    }`}
                  >
                    {k === 'del' ? <Delete className="size-6" aria-hidden /> : k === 'ok' ? (pending ? '…' : 'Entrar') : k}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center text-ink-3">
              <LockKeyhole className="size-10" aria-hidden />
              <p>Elige tu nombre para desbloquear el terminal.</p>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setConfirmUnpair(true)} className="mx-auto text-ink-3">
          <Unlink className="size-4" aria-hidden />
          Desvincular este terminal
        </Button>
      </section>

      <ClockDialog open={clocking} onClose={() => setClocking(false)} />

      <Modal open={confirmUnpair} onClose={() => !unpairing && setConfirmUnpair(false)} title="¿Seguro que quieres desvincular?">
        <p className="text-sm text-ink-2">
          <b>{terminalName}</b> dejará de funcionar en esta tablet y nadie podrá entrar hasta vincularla de nuevo con un código de <b>Ajustes › TPV</b>.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <Button size="lg" onClick={() => setConfirmUnpair(false)} disabled={unpairing}>
            Cancelar
          </Button>
          <Button variant="danger" size="lg" disabled={unpairing} onClick={() => startUnpair(() => unpairTerminal())}>
            {unpairing ? 'Desvinculando…' : 'Sí, desvincular'}
          </Button>
        </div>
      </Modal>
    </main>
  );
}
