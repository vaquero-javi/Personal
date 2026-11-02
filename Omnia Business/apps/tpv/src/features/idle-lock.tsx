'use client';

import { useEffect } from 'react';
import { lock } from '@/server/actions';

/** Si nadie toca la pantalla en `minutes`, el terminal vuelve al PIN. */
export function IdleLock({ minutes }: { minutes: number }) {
  useEffect(() => {
    if (!minutes) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void lock(), minutes * 60_000);
    };
    const events = ['pointerdown', 'keydown'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);
  return null;
}
