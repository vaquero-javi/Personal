'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Vuelve a pedir la página cada `ms` mientras está visible: así un terminal ve
 * las mesas que abren o cobran los demás sin recargar.
 */
export function useAutoRefresh(ms: number, enabled = true) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const t = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms, enabled, router]);
}
