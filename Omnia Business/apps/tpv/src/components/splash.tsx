'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BrandLoop } from './brand-loop';
import { SPLASH_SEEN_KEY } from './splash-guard';

/** Una vuelta de la animación de marca (ver .brand-loop-* en globals.css). */
const LOOP_MS = 6300;

/**
 * Pantalla de carga con la animación de marca. Se pinta en el HTML del servidor
 * para tapar la app desde el primer fotograma; el script de `layout.tsx`
 * la oculta antes de pintar si ya se vio en esta sesión. Un toque la salta.
 * En Vincular no sale: esa pantalla ya lleva la animación de fondo.
 */
export function Splash() {
  const skip = usePathname().startsWith('/vincular');
  const [phase, setPhase] = useState<'on' | 'leaving' | 'off'>(skip ? 'off' : 'on');

  const finish = useCallback(() => {
    sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
    setPhase((p) => (p === 'on' ? 'leaving' : p));
  }, []);

  useEffect(() => {
    if (skip) return void sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
    if (document.documentElement.dataset.splash === 'off') return setPhase('off');
    const t = setTimeout(finish, LOOP_MS);
    return () => clearTimeout(t);
  }, [finish, skip]);

  if (phase === 'off') return null;
  return (
    <div
      aria-hidden
      onClick={finish}
      onTransitionEnd={() => setPhase('off')}
      className={`splash fixed inset-0 z-[100] flex items-center justify-center bg-carton transition-opacity duration-300 ${phase === 'leaving' ? 'pointer-events-none opacity-0' : ''}`}
    >
      {/* Mismo tamaño que tenía el vídeo (1430×892, a pantalla completa). */}
      <BrandLoop className="w-[min(22.4vw,35.9vh)]" />
    </div>
  );
}

