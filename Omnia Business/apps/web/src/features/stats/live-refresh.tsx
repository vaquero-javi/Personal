'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid' });

/**
 * «En directo»: vuelve a pedir la página al servidor cada `seconds` mientras la
 * pestaña está a la vista (y al volver a ella), sin recargar ni perder el scroll.
 */
export function LiveRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [at, setAt] = useState<Date | null>(null);

  useEffect(() => {
    setAt(new Date());
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      start(() => router.refresh());
      setAt(new Date());
    };
    const timer = setInterval(tick, seconds * 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [router, seconds]);

  return (
    <p role="status" className="inline-flex items-center gap-2 rounded-full bg-ok-soft px-3 py-1.5 text-[13px] font-semibold text-ok">
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-sys-green opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-sys-green" />
      </span>
      En directo
      <span className="font-normal text-ink-3" suppressHydrationWarning>
        {pending ? 'actualizando…' : at ? `· ${time.format(at)}` : ''}
      </span>
    </p>
  );
}
