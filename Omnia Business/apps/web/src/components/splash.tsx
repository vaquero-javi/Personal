'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SPLASH_SEEN_KEY } from './splash-guard';

/** Si el vídeo no arranca (autoplay bloqueado, red lenta), la pantalla se quita igual. */
const MAX_MS = 8000;

/** La página de inicio pública no lleva vídeo: se reserva para la entrada a la app. */
const PUBLIC_PATHS = new Set(['/']);

const seenThisSession = () => {
  try {
    return !!sessionStorage.getItem(SPLASH_SEEN_KEY);
  } catch {
    return false;
  }
};

/**
 * Pantalla de carga con el vídeo de marca. Se pinta en el HTML del servidor
 * para tapar la app desde el primer fotograma; el script de `layout.tsx`
 * la oculta antes de pintar si ya se vio en esta sesión. Un toque la salta.
 *
 * En la página de inicio pública queda aplazada: al pasar a la app desde
 * ella (Entrar, Prueba gratis…) la navegación no recarga la página, así que
 * es aquí, al cambiar de ruta, donde se vuelve a encender.
 */
export function Splash() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<'on' | 'leaving' | 'off'>('on');

  const finish = useCallback(() => {
    try {
      sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
    } catch {}
    setPhase((p) => (p === 'on' ? 'leaving' : p));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (PUBLIC_PATHS.has(pathname)) return setPhase('off');
    if (seenThisSession() || matchMedia('(prefers-reduced-motion: reduce)').matches) return setPhase('off');
    // Venimos de la página pública, que la había apagado antes de pintar.
    delete root.dataset.splash;
    setPhase((p) => (p === 'leaving' ? p : 'on'));
    const t = setTimeout(finish, MAX_MS);
    return () => clearTimeout(t);
  }, [pathname, finish]);

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
