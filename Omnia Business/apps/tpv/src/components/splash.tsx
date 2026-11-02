'use client';

import { useCallback, useEffect, useState } from 'react';
import { SPLASH_SEEN_KEY } from './splash-guard';

/** Si el vídeo no arranca (autoplay bloqueado, red lenta), la pantalla se quita igual. */
const MAX_MS = 8000;

/**
 * Pantalla de carga con el vídeo de marca. Se pinta en el HTML del servidor
 * para tapar la app desde el primer fotograma; el script de `layout.tsx`
 * la oculta antes de pintar si ya se vio en esta sesión. Un toque la salta.
 */
export function Splash() {
  const [phase, setPhase] = useState<'on' | 'leaving' | 'off'>('on');

  const finish = useCallback(() => {
    sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
    setPhase((p) => (p === 'on' ? 'leaving' : p));
  }, []);

  useEffect(() => {
    if (document.documentElement.dataset.splash === 'off') return setPhase('off');
    const t = setTimeout(finish, MAX_MS);
    return () => clearTimeout(t);
  }, [finish]);

  if (phase === 'off') return null;
  return (
    <div
      aria-hidden
      onClick={finish}
      onTransitionEnd={() => setPhase('off')}
      className={`splash fixed inset-0 z-[100] flex items-center justify-center bg-white transition-opacity duration-300 ${phase === 'leaving' ? 'pointer-events-none opacity-0' : ''}`}
    >
      <video src="/brand/loading.mp4" autoPlay muted playsInline preload="auto" onEnded={finish} onError={finish} className="size-full object-contain" />
    </div>
  );
}

