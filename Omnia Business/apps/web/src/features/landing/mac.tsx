'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { BOOT_END } from './mac-timeline';

const Mac3D = dynamic(() => import('./mac-3d'), { ssr: false });

const SHOTS = [
  { title: 'Inicio', text: 'Lo urgente del día en una pantalla: cobros pendientes, VeriFactu, fichajes, stock bajo e incidencias.' },
  { title: 'Facturación', text: 'Facturas y tickets numerados por serie, con su huella VeriFactu encadenada en cada emisión.' },
  { title: 'Turnos', text: 'El cuadrante de la semana. Doble clic para poner un turno, también los que acaban al día siguiente.' },
  { title: 'Estadísticas', text: 'Facturación, gastos, neto y liquidez del periodo, comparados con el anterior.' },
];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/**
 * Un MacBook en 3D. Entra girado unos 45° y se abre con el logo de Omnia en
 * la pantalla; al seguir bajando se pone de frente y la pantalla pasa por
 * capturas reales de la app.
 */
export function MacStory() {
  const track = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [shot, setShot] = useState(-1);
  const [active, setActive] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    const update = () => {
      raf = 0;
      if (reduced.matches) {
        setStill(true);
        progress.current = BOOT_END + 0.01;
        setShot((s) => (s < 0 ? 0 : s));
        return;
      }
      setStill(false);
      const travel = el.offsetHeight - innerHeight;
      const p = clamp(-el.getBoundingClientRect().top / travel);
      progress.current = p;
      setShot(p < BOOT_END ? -1 : Math.min(SHOTS.length - 1, Math.floor(clamp((p - BOOT_END) / (1 - BOOT_END)) * SHOTS.length)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const io = new IntersectionObserver(([e]) => setActive(!!e?.isIntersecting), { rootMargin: '20% 0px' });
    io.observe(el);
    update();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    reduced.addEventListener('change', onScroll);
    return () => {
      io.disconnect();
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      reduced.removeEventListener('change', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const goTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    if (still) return setShot(i);
    const travel = el.offsetHeight - innerHeight;
    const p = BOOT_END + ((i + 0.5) / SHOTS.length) * (1 - BOOT_END);
    scrollTo({ top: el.offsetTop + travel * p, behavior: 'smooth' });
  };

  const current = shot >= 0 ? SHOTS[shot]! : null;

  return (
    <section ref={track} id="la-app" aria-labelledby="ln-mac-title" className="ln-mac-track">
      <div className="ln-mac-stage flex flex-col">
        <div className="ln-wrap ln-chapter relative z-10 pt-6">
          <span>La app</span>
          <span>Capítulo 02</span>
        </div>
        <h2 id="ln-mac-title" className="ln-serif ln-wrap relative z-10 mt-3 text-center text-[clamp(44px,7.4vw,124px)]">
          Todo, en una pantalla.
        </h2>

        <div className="relative min-h-0 flex-1" role="img" aria-label={current ? `Un MacBook con Omnia abierto en ${current.title}` : 'Un MacBook que se abre con el logo de Omnia'}>
          <div className="absolute inset-0">
            <Mac3D progress={progress} screen={shot + 1} active={active} />
          </div>
        </div>

        <div className="ln-wrap relative z-10 grid gap-4 pb-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <p aria-live="polite" className="min-h-[3lh] max-w-[46ch] text-[17px] leading-[1.45] md:text-[18px]">
            {current ? (
              <span key={current.title} className="ln-swap block">
                <b className="font-semibold">{current.title}.</b> <span className="text-[var(--ink-2)]">{current.text}</span>
              </span>
            ) : (
              <span className="text-[var(--ink-2)]">Sigue bajando: el Mac se gira y se enciende con tu empresa dentro.</span>
            )}
          </p>
          <ol className="flex flex-wrap gap-1.5" aria-label="Pantallas">
            {SHOTS.map((s, i) => (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={i === shot ? 'true' : undefined}
                  className={`h-9 rounded-full px-4 text-[15px] font-medium transition-colors ${i === shot ? 'bg-[var(--pill)] text-[var(--pill-ink)]' : 'bg-white/10 text-[var(--ink)] hover:bg-white/20'}`}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
