'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo, TRIAL_HREF } from './shared';

/** Píldora fija abajo: aparece al dejar atrás la portada y se va al llegar al cierre. */
export function FloatingCta() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const update = () => {
      const end = document.getElementById('empieza');
      const nearEnd = end ? end.getBoundingClientRect().top < innerHeight * 0.9 : false;
      // Fuera mientras el Mac, los módulos, los ejemplos a medida o el deslizador del día ocupan la pantalla.
      const busy = ['la-app', 'modulos', 'a-medida', 'un-dia'].some((id) => {
        const r = document.getElementById(id)?.getBoundingClientRect();
        return r ? r.top < innerHeight * 0.5 && r.bottom > innerHeight * 0.5 : false;
      });
      setOn(scrollY > innerHeight * 0.7 && !nearEnd && !busy);
    };
    update();
    addEventListener('scroll', update, { passive: true });
    return () => removeEventListener('scroll', update);
  }, []);
  return (
    <div className="ln-float" data-on={on || undefined} aria-hidden={!on}>
      <div className="flex items-center gap-2 rounded-full bg-[#141416]/90 p-1.5 pl-4 ring-1 ring-white/10 backdrop-blur-xl">
        <Logo className="h-5 w-auto text-[var(--pill)]" />
        <Link href={TRIAL_HREF} tabIndex={on ? 0 : -1} className="ln-pill !h-10 !px-5 !text-[15px]">
          Prueba gratis un mes
        </Link>
      </div>
    </div>
  );
}
