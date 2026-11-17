'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Bell, BellOff, ChevronRight } from 'lucide-react';
import {
  getMutedPush,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
  setPushCategory,
  type PushCategory,
} from '@/server/push-actions';

const CATEGORIES: { value: PushCategory; label: string; hint: string }[] = [
  { value: 'messages', label: 'Mensajes', hint: 'Mensajes y respuestas nuevas' },
  { value: 'tasks', label: 'Tareas', hint: 'Cuando te asignan una tarea' },
  { value: 'incidents', label: 'Incidencias', hint: 'Asignadas a ti y comentarios' },
  { value: 'leave', label: 'Ausencias', hint: 'Solicitudes y respuestas' },
  { value: 'payslips', label: 'Nóminas', hint: 'Cuando te suben una nómina' },
];

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

type State = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

const urlBase64ToUint8Array = (base64: string) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

async function registration() {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

async function subscribe(): Promise<PushSubscription> {
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY!) }));
  await savePushSubscription(sub.toJSON());
  return sub;
}

/**
 * Notificaciones push en este dispositivo: un interruptor en la barra lateral.
 * En iPhone/iPad solo funcionan con Omnia añadida a la pantalla de inicio.
 */
export function PushToggle() {
  const [state, setState] = useState<State>('loading');
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [muted, setMuted] = useState<PushCategory[] | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!PUBLIC_KEY || !('serviceWorker' in navigator)) return setState('unsupported');
    if (!('PushManager' in window) || !('Notification' in window)) return setState(isIos() && !isStandalone() ? 'ios-install' : 'unsupported');
    if (Notification.permission === 'denied') return setState('denied');
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') {
      // Se vuelve a guardar por si el servidor la había perdido (o cambió de cuenta en este navegador).
      await savePushSubscription(sub.toJSON()).catch(() => undefined);
      return setState('on');
    }
    setState('off');
  }, []);

  // Las preferencias se cargan al abrir el desplegable (son de la persona, no del dispositivo).
  useEffect(() => {
    if (open && muted === null) void getMutedPush().then(setMuted).catch(() => setMuted([]));
  }, [open, muted]);

  const toggleCategory = (category: PushCategory, enabled: boolean) => {
    setMuted((m) => (enabled ? (m ?? []).filter((c) => c !== category) : [...(m ?? []), category]));
    start(async () => {
      try {
        setMuted(await setPushCategory(category, enabled));
      } catch {
        setNote('No se ha podido guardar. Inténtalo de nuevo.');
        setMuted(await getMutedPush().catch(() => null));
      }
    });
  };

  useEffect(() => {
    void refresh();
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'push-resubscribe') void subscribe().then(() => setState('on')).catch(() => setState('off'));
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, [refresh]);

  const enable = () =>
    start(async () => {
      setNote(null);
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      try {
        await subscribe();
        setState('on');
        await sendTestPush();
      } catch {
        setNote('No se han podido activar. Inténtalo de nuevo.');
        setState('off');
      }
    });

  const disable = () =>
    start(async () => {
      setNote(null);
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint).catch(() => undefined);
        await sub.unsubscribe().catch(() => undefined);
      }
      setState('off');
    });

  if (state === 'loading' || state === 'unsupported') return null;

  const on = state === 'on';
  const hint =
    state === 'ios-install'
      ? 'En iPhone: Compartir › «Añadir a pantalla de inicio» y ábrela desde ahí.'
      : state === 'denied'
        ? 'Bloqueadas en este navegador: permítelas en los ajustes del sitio.'
        : note;

  return (
    <div className="mt-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={pending || state === 'ios-install' || state === 'denied'}
        onClick={on ? disable : enable}
        className="pressable flex h-8 w-full items-center gap-2 rounded-[9px] px-2 text-[13px] font-medium text-ink-2 hover:bg-fill disabled:opacity-60 disabled:hover:bg-transparent"
      >
        {on ? <Bell aria-hidden className="size-4 text-tint" /> : <BellOff aria-hidden className="size-4" />}
        <span className="flex-1 text-left">Notificaciones</span>
        <span aria-hidden className={`relative h-[18px] w-[30px] rounded-full transition-colors ${on ? 'bg-ok' : 'bg-fill-strong'}`}>
          <span className={`absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-[left] ${on ? 'left-[14px]' : 'left-[2px]'}`} />
        </span>
      </button>
      {hint && <p className="px-2 pt-1 text-[11px] leading-snug text-ink-3">{hint}</p>}
      {on && (
        <div className="mt-0.5">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="push-categories"
            onClick={() => setOpen((v) => !v)}
            className="pressable flex h-7 w-full items-center gap-1 rounded-[7px] px-2 text-[12px] font-medium text-ink-3 hover:text-ink"
          >
            <ChevronRight aria-hidden className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
            Elegir avisos
            {muted && muted.length > 0 && <span className="ml-auto text-[11px]">{CATEGORIES.length - muted.length} de {CATEGORIES.length}</span>}
          </button>
          {open && (
            <ul id="push-categories" className="flex flex-col gap-px pb-1 pl-2">
              {CATEGORIES.map((c) => {
                const enabled = muted === null ? true : !muted.includes(c.value);
                return (
                  <li key={c.value}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-[7px] px-2 py-1.5 hover:bg-fill">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-tint"
                        checked={enabled}
                        disabled={muted === null}
                        onChange={(e) => toggleCategory(c.value, e.target.checked)}
                      />
                      <span className="flex flex-col leading-tight">
                        <span className="text-[13px] font-medium">{c.label}</span>
                        <span className="text-[11px] text-ink-3">{c.hint}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
