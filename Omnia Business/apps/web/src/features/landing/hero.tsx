'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ChainFragment, ClockFragment, IncidentFragment, PosFragment, StatsFragment, TasksFragment } from './fragments';
import { ENTER_HREF, Logo, TRIAL_HREF } from './shared';

// Tarjetas flotando en 3D: posición (% del escenario), giro y profundidad.
const CARDS = [
  { F: PosFragment, x: 4, y: 18, rx: 8, ry: 28, rz: -6, z: -160 },
  { F: StatsFragment, x: 23, y: 40, rx: -6, ry: 18, rz: 4, z: 40 },
  { F: ChainFragment, x: 40, y: 8, rx: 4, ry: 0, rz: -2, z: 120 },
  { F: ClockFragment, x: 60, y: 38, rx: -8, ry: -16, rz: 5, z: 0 },
  { F: TasksFragment, x: 76, y: 6, rx: 6, ry: -26, rz: -4, z: -120 },
  { F: IncidentFragment, x: 82, y: 52, rx: -4, ry: -32, rz: 3, z: -260 },
];

/** Portada: el título enorme y, debajo, piezas reales de la app flotando en el espacio. */
export function Hero() {
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = stage.current;
    if (!el) return;
    let mx = 0;
    let my = 0;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const sy = scrollY / innerHeight;
      el.querySelectorAll<HTMLElement>('.ln-card').forEach((card, i) => {
        const c = CARDS[i]!;
        const depth = 1 + (c.z + 260) / 400;
        card.style.transform = `translate3d(${mx * 18 * depth}px, ${-sy * 220 * depth + my * 12 * depth}px, ${c.z + sy * 160}px) rotateX(${c.rx + my * 4 + sy * 18}deg) rotateY(${c.ry + mx * 6}deg) rotateZ(${c.rz}deg)`;
      });
    };
    const req = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onMove = (e: PointerEvent) => {
      mx = e.clientX / innerWidth - 0.5;
      my = e.clientY / innerHeight - 0.5;
      req();
    };
    paint();
    addEventListener('scroll', req, { passive: true });
    addEventListener('pointermove', onMove, { passive: true });
    return () => {
      removeEventListener('scroll', req);
      removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section aria-labelledby="ln-title" className="relative flex min-h-[100svh] flex-col overflow-hidden">
      <header className="ln-wrap relative z-20 grid grid-cols-[auto_1fr_auto] items-center gap-6 pt-6">
        <Link href="/" className="flex items-center gap-2 rounded-lg" aria-label="Omnia, inicio">
          <Logo className="h-7 w-auto text-[var(--pill)]" />
          <span className="text-[22px] font-bold tracking-[-0.02em] text-[var(--pill)]">Omnia</span>
        </Link>
        <p className="mx-auto hidden max-w-[44ch] text-center text-[15px] leading-[1.35] text-[var(--ink-2)] lg:block">
          Ventas, facturas, almacén, fichajes y turnos de tu empresa en una sola app.
        </p>
        <nav aria-label="Principal" className="flex items-center gap-2">
          <Link href={ENTER_HREF} className="hidden rounded-full px-4 py-2 text-[15px] font-medium hover:bg-white/10 sm:inline-block">
            Entrar
          </Link>
          <Link href={TRIAL_HREF} className="ln-pill !h-11 !px-5 !text-[15px]">
            Prueba gratis
          </Link>
        </nav>
      </header>

      <h1 id="ln-title" className="ln-serif ln-wrap relative z-10 mt-[clamp(28px,5vh,64px)] text-center text-[clamp(52px,10.4vw,188px)]">
        Toda tu empresa
      </h1>

      <div ref={stage} aria-hidden className="ln-cards relative min-h-[420px] flex-1 max-md:hidden">
        {CARDS.map(({ F, x, y, rx, ry, rz, z }, i) => (
          <div key={i} className="ln-card" style={{ left: `${x}%`, top: `${y}%`, transform: `translate3d(0,0,${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)` }}>
            <F />
          </div>
        ))}
      </div>

      <div className="ln-wrap relative z-10 mt-8 flex flex-col items-center gap-6 pb-10 text-center md:hidden">
        <p className="max-w-[34ch] text-[18px] leading-[1.45] text-[var(--ink-2)]">Ventas, facturas, almacén, fichajes y turnos de tu empresa en una sola app.</p>
        <div className="w-full max-w-[340px] -rotate-2 text-left">
          <ChainFragment />
        </div>
        <div className="w-full max-w-[300px] translate-x-6 rotate-3 text-left">
          <ClockFragment />
        </div>
      </div>
    </section>
  );
}
