'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BUY_HREF, TRIAL_HREF } from './shared';

const PLANS = [
  { key: 'prueba', name: 'Prueba gratis', figure: '0 €', period: 'durante un mes', text: 'Todos los módulos abiertos durante un mes, con tus datos reales y tu equipo dentro. Al terminar decides si sigues.', action: 'Empezar la prueba gratis', href: TRIAL_HREF },
  { key: 'contratar', name: 'Contratar', figure: 'A medida', period: 'según tu empresa', text: 'Te preparamos el plan según tus sociedades, tu equipo y los módulos que vayas a usar, y te ayudamos a pasar tus datos.', action: 'Contratar Omnia', href: BUY_HREF },
];

/** Dos planes como dos palabras enormes; el elegido muestra su cifra y su botón. */
export function Plans() {
  const [sel, setSel] = useState(0);
  const p = PLANS[sel]!;
  return (
    <section id="precios" aria-labelledby="ln-plans-title" className="ln-wrap pt-[clamp(96px,12vw,200px)]">
      <div className="ln-chapter">
        <span>Precios</span>
        <span>Capítulo 06</span>
      </div>
      <h2 id="ln-plans-title" className="sr-only">
        Precios
      </h2>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
        <div role="tablist" aria-label="Planes" className="flex flex-col">
          {PLANS.map((pl, i) => (
            <button
              key={pl.key}
              type="button"
              role="tab"
              id={`plan-${pl.key}`}
              aria-selected={i === sel}
              aria-controls="plan-panel"
              onClick={() => setSel(i)}
              onFocus={() => setSel(i)}
              className={`ln-serif text-left text-[clamp(52px,9vw,160px)] transition-opacity ${i === sel ? 'opacity-100' : 'opacity-30 hover:opacity-60'}`}
            >
              {pl.name}
            </button>
          ))}
        </div>
        <div id="plan-panel" role="tabpanel" aria-labelledby={`plan-${p.key}`}>
          <div key={p.key} className="ln-swap">
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="ln-serif text-[clamp(56px,6vw,104px)]">{p.figure}</span>
              <span className="text-[17px] text-[var(--ink-2)]">{p.period}</span>
            </p>
            <p className="mt-5 max-w-[42ch] text-[18px] leading-[1.5] text-[var(--ink-2)]">{p.text}</p>
            <Link href={p.href} className="ln-pill mt-8">
              {p.action}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
