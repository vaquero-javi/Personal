'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Coffee, LogIn, LogOut, MapPin, Play } from 'lucide-react';
import type { ClockState } from '@omnia/hr/types';
import type { ActionState } from '@/server/actions';
import { Notice } from '@/components/ui/form';
import { buttonClass } from '@/components/ui/button';

type EntryType = 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
type Clock = (payload: { entryType: EntryType; latitude?: number; longitude?: number; accuracy?: number; geoConsent: boolean; establishmentId?: string }) => Promise<ActionState>;

const ACTIONS: Record<ClockState, { type: EntryType; label: string; icon: typeof LogIn; primary?: boolean }[]> = {
  out: [{ type: 'clock_in', label: 'Fichar entrada', icon: LogIn, primary: true }],
  working: [
    { type: 'clock_out', label: 'Fichar salida', icon: LogOut, primary: true },
    { type: 'break_start', label: 'Iniciar pausa', icon: Coffee },
  ],
  on_break: [
    { type: 'break_end', label: 'Volver de la pausa', icon: Play, primary: true },
    { type: 'clock_out', label: 'Fichar salida', icon: LogOut },
  ],
};

const STATE_LABEL: Record<ClockState, string> = { out: 'Fuera de jornada', working: 'Trabajando', on_break: 'En pausa' };

/**
 * Botonera de fichaje. La ubicación es opcional y solo se envía con el
 * consentimiento explícito de la persona (RGPD); el servidor lo comprueba.
 */
export function ClockPanel({
  state,
  clock,
  lateSince,
  establishments = [],
  defaultEstablishmentId,
}: {
  state: ClockState;
  clock: Clock;
  /** Turno ya empezado sin entrada (hh:mm). */
  lateSince?: string;
  /** Locales en los que trabaja la persona. Con más de uno, elige dónde ficha. */
  establishments?: { id: string; name: string }[];
  defaultEstablishmentId?: string;
}) {
  const [geo, setGeo] = useState(false);
  const [establishmentId, setEstablishmentId] = useState(defaultEstablishmentId ?? establishments[0]?.id ?? '');
  const choose = establishments.length > 1;
  const [result, setResult] = useState<ActionState | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const position = () =>
    new Promise<GeolocationPosition | null>((resolve) => {
      if (!geo || !('geolocation' in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 8000 });
    });

  const press = (type: EntryType) =>
    startTransition(async () => {
      const pos = await position();
      const res = await clock({
        entryType: type,
        geoConsent: geo && !!pos,
        ...(choose && establishmentId ? { establishmentId } : {}),
        ...(pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy } : {}),
      });
      setResult(res);
      if (res.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-sm">
        <span aria-hidden className={`size-2.5 rounded-full ${state === 'working' ? 'bg-ok' : state === 'on_break' ? 'bg-warning-line' : lateSince ? 'bg-danger' : 'bg-shelf-edge'}`} />
        <b className={state === 'out' && lateSince ? 'text-danger' : undefined}>
          {state === 'out' && lateSince ? `Sin fichar · tu turno empezó a las ${lateSince}` : STATE_LABEL[state]}
        </b>
      </p>
      {choose && (
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2 sm:max-w-xs">
          Local donde fichas
          <select
            value={establishmentId}
            onChange={(e) => setEstablishmentId(e.target.value)}
            className="h-9 rounded-[10px] bg-fill px-3 text-[15px] text-ink focus:bg-sheet focus:ring-[3px] focus:ring-tint/45 focus:outline-none"
          >
            {establishments.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
      )}
      {result?.error && <Notice tone="danger">{result.error}</Notice>}
      {result?.ok && result.message && <Notice tone="ok">{result.message}</Notice>}
      <div className="flex flex-wrap gap-2">
        {ACTIONS[state].map(({ type, label, icon: Icon, primary }) => (
          <button key={type} type="button" disabled={pending} onClick={() => press(type)} className={buttonClass(primary ? 'primary' : 'secondary', 'h-12 px-5 text-base')}>
            <Icon aria-hidden className="size-5" />
            {pending ? 'Registrando…' : label}
          </button>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" className="mt-0.5 size-4 accent-tint" checked={geo} onChange={(e) => setGeo(e.target.checked)} />
        <span>
          <MapPin aria-hidden className="mr-1 inline size-4 align-text-bottom" />
          Adjuntar mi ubicación a este fichaje. Solo se guarda si lo marcas; tu empresa no puede activarlo por ti.
        </span>
      </label>
    </div>
  );
}
