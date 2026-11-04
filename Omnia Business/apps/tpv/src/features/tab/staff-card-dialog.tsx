'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Delete, ScanLine } from 'lucide-react';
import type { ValidateQrResponse } from '@omnia/staff-cards/contracts';
import { Button, Modal, Notice } from '@/components/ui';

/**
 * Lectura de la tarjeta de empleado en una cuenta:
 *   1. QR: pistola USB/Bluetooth (teclea el texto y Enter en el campo), cámara de
 *      la tablet si el navegador tiene BarcodeDetector, o pegarlo a mano.
 *   2. PIN del titular, si su política lo pide (el servidor responde pin_required).
 *   3. Confirmación con el descuento aplicado.
 * El porcentaje lo decide el servidor; aquí solo se muestra.
 */

type Applied = Extract<ValidateQrResponse, { status: 'applied' }>;
type Step = { kind: 'scan' } | { kind: 'pin'; qr: string; holder: { name: string; role: string } } | { kind: 'done'; result: Applied };

const REASONS: Record<string, string> = {
  QR_FORMAT: 'Ese QR no es una tarjeta de empleado de Omnia.',
  CARD_UNKNOWN: 'Tarjeta no reconocida en este local.',
  CARD_INVALID: 'El QR ha caducado o no es válido. Pide que lo vuelva a enseñar.',
  CARD_REVOKED: 'Esta tarjeta está revocada.',
  HOLDER_INACTIVE: 'El titular ya no está activo en la empresa.',
  NO_POLICY: 'El puesto del titular no tiene descuento de empleado.',
  PIN_WRONG: 'PIN incorrecto.',
  PIN_LOCKED: 'PIN bloqueado por demasiados intentos. Espera unos minutos.',
  SELF_SERVICE: 'No puedes aplicarte tu propia tarjeta: pídeselo a un compañero.',
  CODE_REUSED: 'Ese código ya se ha usado. Espera a que cambie el QR (30 s).',
  DAILY_LIMIT: 'Ha llegado al límite de descuentos de hoy.',
  MONTHLY_LIMIT: 'Ha llegado al tope de descuento de este mes.',
  TAB_HAS_CARD: 'Esta cuenta ya tiene la tarjeta de otra persona.',
};

async function validate(tabId: string, qr: string, pin?: string): Promise<{ ok: true; body: ValidateQrResponse } | { ok: false; error: string }> {
  try {
    const response = await fetch('/api/v1/discounts/validate-qr', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tabId, qr, ...(pin ? { pin } : {}) }),
    });
    const body = await response.json();
    if (response.ok) return { ok: true, body: body as ValidateQrResponse };
    return { ok: false, error: REASONS[body.reason as string] ?? body.detail ?? 'No se pudo validar la tarjeta' };
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor. Inténtalo de nuevo.' };
  }
}

export function StaffCardDialog({ open, tabId, onClose, onApplied }: { open: boolean; tabId: string; onClose: () => void; onApplied: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'scan' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Cada apertura empieza de cero.
  const [openedAt, setOpenedAt] = useState(0);
  if (open && openedAt === 0) setOpenedAt(Date.now());
  if (!open && openedAt !== 0) {
    setOpenedAt(0);
    setStep({ kind: 'scan' });
    setError(null);
  }

  const submit = async (qr: string, pin?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await validate(tabId, qr.trim(), pin);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (result.body.status === 'pin_required') return setStep({ kind: 'pin', qr: qr.trim(), holder: result.body.holder });
    setStep({ kind: 'done', result: result.body });
    onApplied();
  };

  return (
    <Modal open={open} onClose={onClose} title="Tarjeta de empleado">
      <div className="flex flex-col gap-4">
        {error && <Notice tone="danger">{error}</Notice>}
        {step.kind === 'scan' && <ScanStep busy={busy} onCode={(qr) => submit(qr)} />}
        {step.kind === 'pin' && <PinStep holder={step.holder} busy={busy} onPin={(pin) => submit(step.qr, pin)} onBack={() => setStep({ kind: 'scan' })} />}
        {step.kind === 'done' && <AppliedCard result={step.result} onClose={onClose} />}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ 1. QR

function ScanStep({ busy, onCode }: { busy: boolean; onCode: (qr: string) => void }) {
  const [value, setValue] = useState('');
  const [camera, setCamera] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const canUseCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices;

  // La pistola «teclea» en el campo con foco: se mantiene enfocado.
  useEffect(() => {
    if (!camera) input.current?.focus();
  }, [camera, busy]);

  return (
    <div className="flex flex-col gap-4">
      {camera ? (
        <CameraScanner
          onCode={(qr) => {
            setCamera(false);
            onCode(qr);
          }}
          onCancel={() => setCamera(false)}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-shelf-edge bg-sheet-head p-6 text-center">
          <ScanLine className="size-10 text-ink-2" aria-hidden />
          <p className="font-semibold">Escanea el QR de la tarjeta</p>
          <p className="text-sm text-ink-3">Con el lector de códigos, o con la cámara de la tablet.</p>
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onCode(value);
          setValue('');
        }}
      >
        <label htmlFor="staff-qr" className="sr-only">Código de la tarjeta</label>
        <input
          ref={input}
          id="staff-qr"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="OMN1:… (el lector lo escribe aquí)"
          className="h-11 min-w-0 flex-1 rounded-lg border border-shelf-edge px-3 font-mono text-sm"
        />
        <Button type="submit" variant="primary" disabled={busy || !value.trim()}>{busy ? 'Validando…' : 'Validar'}</Button>
      </form>

      {canUseCamera && !camera && (
        <Button size="lg" onClick={() => setCamera(true)} disabled={busy}>
          <Camera className="size-5" aria-hidden /> Usar la cámara
        </Button>
      )}
    </div>
  );
}

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> }

function CameraScanner({ onCode, onCancel }: { onCode: (qr: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Referencia estable: la cámara no se reinicia cada vez que el padre repinta.
  const found = useRef(onCode);
  found.current = onCode;

  useEffect(() => {
    let stream: MediaStream | undefined;
    let raf = 0;
    let stopped = false;
    const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
    const detector = new Detector({ formats: ['qr_code'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const loop = async () => {
          if (stopped || !video.current) return;
          try {
            const [code] = await detector.detect(video.current);
            if (code?.rawValue) return found.current(code.rawValue);
          } catch {
            // Fotograma sin código: se sigue mirando.
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch {
        setError('No se puede usar la cámara. Revisa el permiso del navegador o usa el lector.');
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <Notice tone="warning">{error}</Notice>
      ) : (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} muted playsInline className="aspect-square w-full object-cover" />
          <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80" />
        </div>
      )}
      <Button onClick={onCancel}>Cancelar cámara</Button>
    </div>
  );
}

// ------------------------------------------------------------------ 2. PIN

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'] as const;

function PinStep({ holder, busy, onPin, onBack }: { holder: { name: string; role: string }; busy: boolean; onPin: (pin: string) => void; onBack: () => void }) {
  const [pin, setPin] = useState('');
  const press = (key: (typeof KEYS)[number]) => {
    if (busy) return;
    if (key === 'del') return setPin((p) => p.slice(0, -1));
    if (key === 'ok') {
      if (pin.length >= 4) onPin(pin);
      return setPin('');
    }
    setPin((p) => (p + key).slice(0, 6));
  };

  // Teclado físico.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter') press('ok');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <p className="text-sm text-ink-3">Que teclee su PIN de Omnia</p>
        <p className="text-xl font-bold">{holder.name}</p>
        <p className="text-sm text-ink-3">{holder.role}</p>
      </div>
      <div className="flex justify-center gap-3" aria-live="polite" aria-label={`${pin.length} cifras tecleadas`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={`size-4 rounded-full border-2 border-ink ${i < pin.length ? 'bg-ink' : ''}`} />
        ))}
      </div>
      <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={busy || (k === 'ok' && pin.length < 4)}
            onClick={() => press(k)}
            aria-label={k === 'del' ? 'Borrar' : k === 'ok' ? 'Aceptar' : k}
            className={`flex h-16 items-center justify-center rounded-xl text-2xl font-bold transition-colors disabled:opacity-40 ${
              k === 'ok' ? 'bg-ink text-base text-white' : 'border border-shelf-edge bg-sheet hover:bg-sheet-head active:bg-line-soft'
            }`}
          >
            {k === 'del' ? <Delete className="size-6" aria-hidden /> : k === 'ok' ? (busy ? '…' : 'Aceptar') : k}
          </button>
        ))}
      </div>
      <Button variant="ghost" onClick={onBack} disabled={busy}>Volver a escanear</Button>
    </div>
  );
}

// ------------------------------------------------------------------ 3. Confirmación (cristal, como la tarjeta)

function AppliedCard({ result, onClose }: { result: Applied; onClose: () => void }) {
  const { limits } = result;
  return (
    <div className="flex flex-col gap-4">
      <div className="relative isolate overflow-hidden rounded-2xl bg-[#0f1116] p-5">
        <div aria-hidden className="pointer-events-none absolute -left-10 -top-12 size-48 rounded-full bg-[#ffb547] opacity-60 blur-[60px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-12 size-52 rounded-full bg-[#7c5cff] opacity-55 blur-[70px]" />
        <div className="relative flex flex-col gap-3 rounded-2xl border border-white/25 bg-white/10 p-5 text-white shadow-[0_16px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-2xl">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/20 to-transparent" />
          <p className="relative text-xs font-semibold uppercase tracking-[0.14em] text-white/70">{result.alreadyApplied ? 'Ya estaba aplicada' : 'Descuento aplicado'}</p>
          <div className="relative flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xl font-bold">{result.holder.name}</p>
              <p className="text-sm text-white/75">{result.holder.role}</p>
            </div>
            <p className="text-4xl font-bold tabular-nums">−{Number(result.discount.percent).toLocaleString('es-ES')} %</p>
          </div>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-3 text-sm">
        <li className="rounded-lg bg-sheet-head p-3">
          <p className="text-xs text-ink-3">Usos hoy</p>
          <p className="font-bold tabular-nums">{limits.usesToday}{limits.maxUsesPerDay ? ` de ${limits.maxUsesPerDay}` : ''}</p>
        </li>
        <li className="rounded-lg bg-sheet-head p-3">
          <p className="text-xs text-ink-3">Descontado este mes</p>
          <p className="font-bold tabular-nums">
            {Number(limits.discountThisMonth).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            {limits.monthlyCap ? ` de ${Number(limits.monthlyCap).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}` : ''}
          </p>
        </li>
      </ul>
      <p className="text-sm text-ink-3">Se aplica a toda la cuenta, también a lo que se añada después.</p>
      <Button size="lg" variant="primary" onClick={onClose}>Seguir con la cuenta</Button>
    </div>
  );
}
