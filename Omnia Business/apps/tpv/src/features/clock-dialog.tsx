'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Coffee, LogIn, LogOut, Play } from 'lucide-react';
import type { ClockEntryType, ClockLookup } from '@omnia/staff-cards';
import { Button, Modal, Notice } from '@/components/ui';
import { formatTime } from '@/lib/format';
import { clockLookup, clockRegister } from '@/server/actions';
import { PinStep, ScanStep } from './tab/staff-card-dialog';

/**
 * Fichar con la tarjeta de empleado en la pantalla de bloqueo del TPV:
 *   1. Escanea la tarjeta (lector o cámara).
 *   2. Ve cómo está su jornada y elige qué fichar (la opción habitual, la primera).
 *   3. Teclea su PIN: siempre, para que nadie fiche por otro con una foto del QR.
 *   4. Confirmación con la hora, y la pantalla vuelve sola al inicio.
 */

const ACTIONS: Record<ClockEntryType, { label: string; done: string; icon: typeof LogIn }> = {
  clock_in: { label: 'Fichar entrada', done: 'Entrada registrada', icon: LogIn },
  clock_out: { label: 'Fichar salida', done: 'Salida registrada', icon: LogOut },
  break_start: { label: 'Empezar pausa', done: 'Pausa iniciada', icon: Coffee },
  break_end: { label: 'Volver de la pausa', done: 'Pausa terminada', icon: Play },
};

const STATE_TEXT = {
  out: () => 'Estás fuera de turno',
  working: (since: Date | null) => (since ? `Trabajando desde las ${formatTime(since)}` : 'Trabajando'),
  on_break: (since: Date | null) => (since ? `En pausa desde las ${formatTime(since)}` : 'En pausa'),
} as const;

type Step =
  | { kind: 'scan' }
  | { kind: 'choose'; qr: string; info: ClockLookup }
  | { kind: 'pin'; qr: string; info: ClockLookup; entryType: ClockEntryType }
  | { kind: 'done'; entryType: ClockEntryType; at: Date; name: string };

export function ClockDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'scan' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Cada apertura empieza de cero.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setStep({ kind: 'scan' });
      setError(null);
    }
  }

  // Tras fichar, vuelve sola a la pantalla de inicio: el siguiente compañero ficha detrás.
  useEffect(() => {
    if (step.kind !== 'done') return;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [step, onClose]);

  const lookup = async (qr: string) => {
    setBusy(true);
    setError(null);
    const result = await clockLookup(qr.trim());
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setStep({ kind: 'choose', qr: qr.trim(), info: result.data });
  };

  const register = async (qr: string, entryType: ClockEntryType, pin: string) => {
    setBusy(true);
    setError(null);
    const result = await clockRegister({ qr, entryType, pin });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setStep({ kind: 'done', entryType, at: new Date(result.data.occurredAt), name: result.data.holderName });
  };

  return (
    <Modal open={open} onClose={onClose} title="Fichar con la tarjeta">
      <div className="flex flex-col gap-4">
        {error && <Notice tone="danger">{error}</Notice>}

        {step.kind === 'scan' && <ScanStep busy={busy} onCode={lookup} />}

        {step.kind === 'choose' && (
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <p className="text-xl font-bold">{step.info.holder.name}</p>
              <p className="text-sm text-ink-3">{step.info.holder.role}</p>
              <p className="mt-2 inline-flex rounded-full bg-sheet-head px-3 py-1 text-sm font-semibold text-ink-2">
                {STATE_TEXT[step.info.state](step.info.lastEntryAt ? new Date(step.info.lastEntryAt) : null)}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {step.info.actions.map((entryType, i) => {
                const { label, icon: Icon } = ACTIONS[entryType];
                return (
                  <Button
                    key={entryType}
                    size={i === 0 ? 'xl' : 'lg'}
                    variant={i === 0 ? 'primary' : 'secondary'}
                    onClick={() => setStep({ kind: 'pin', qr: step.qr, info: step.info, entryType })}
                  >
                    <Icon className="size-6" aria-hidden /> {label}
                  </Button>
                );
              })}
            </div>
            <Button variant="ghost" onClick={() => setStep({ kind: 'scan' })}>No soy yo</Button>
          </div>
        )}

        {step.kind === 'pin' && (
          <PinStep
            holder={step.info.holder}
            busy={busy}
            prompt={`${ACTIONS[step.entryType].label}: teclea tu PIN`}
            okLabel="Fichar"
            onPin={(pin) => register(step.qr, step.entryType, pin)}
            onBack={() => setStep({ kind: 'choose', qr: step.qr, info: step.info })}
          />
        )}

        {step.kind === 'done' && (
          <div className="flex flex-col items-center gap-4 text-center" role="status">
            <CheckCircle2 className="size-16 text-ok" aria-hidden />
            <div>
              <p className="text-2xl font-bold">{ACTIONS[step.entryType].done}</p>
              <p className="text-4xl font-bold tabular-nums">{formatTime(step.at)}</p>
              <p className="mt-1 text-ink-2">{step.name}</p>
            </div>
            <Button size="lg" variant="primary" className="w-full" onClick={onClose}>Listo</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
