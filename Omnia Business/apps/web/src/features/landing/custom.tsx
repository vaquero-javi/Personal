'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

const NEEDS = [
  { key: 'informe', label: 'Un informe a tu medida', detail: 'Ventas por comercial y por zona, cada lunes en tu correo.' },
  { key: 'campos', label: 'Datos propios en tus fichas', detail: 'Talla, matrícula, nº de lote… lo que tu negocio necesite guardar.' },
  { key: 'flujo', label: 'Un circuito de aprobación', detail: 'Que las compras de más de 500 € las apruebe gerencia antes de pedirlas.' },
  { key: 'modulo', label: 'Un módulo nuevo', detail: 'Reservas, mantenimiento de equipos, obras… lo que hoy llevas aparte.' },
];

const STEPS = ['Nos lo cuentas', 'Lo diseñamos contigo', 'Lo tienes en tu Omnia'];

/** «¿Te falta algo?»: eliges una necesidad de ejemplo y la petición avanza hasta estar lista. */
export function CustomWork() {
  const [need, setNeed] = useState(0);
  const [step, setStep] = useState(0);

  // Al cambiar de ejemplo, la petición vuelve a recorrer sus pasos.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setStep(STEPS.length - 1);
    setStep(0);
    const timers = STEPS.slice(1).map((_, i) => setTimeout(() => setStep(i + 1), 700 * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [need]);

  const n = NEEDS[need]!;

  return (
    <section id="a-medida" aria-labelledby="ln-custom-title" className="ln-wrap pt-[clamp(96px,12vw,200px)]">
      <div className="ln-chapter">
        <span>A tu medida</span>
        <span>Capítulo 04</span>
      </div>
      <div className="mt-6 grid gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:items-center">
        <div>
          <h2 id="ln-custom-title" className="ln-serif text-[clamp(48px,7.4vw,128px)] !leading-[1.1]">
            ¿Te falta algo? Lo añadimos.
          </h2>
          <p data-reveal className="mt-8 max-w-[46ch] text-[18px] leading-[1.55] text-[var(--ink-2)]">
            Si tu empresa necesita algo concreto que Omnia aún no hace, nuestro equipo lo desarrolla y lo añade a tu app. Sin cambiar de programa y sin perder lo que ya tienes dentro.
          </p>
          <a data-reveal style={{ '--i': 1 } as React.CSSProperties} href="#contacto" className="ln-pill mt-8">
            Cuéntanos qué necesitas
          </a>
        </div>

        <div data-reveal style={{ '--i': 2 } as React.CSSProperties} className="ln-contact rounded-[clamp(24px,2.4vw,36px)] p-[clamp(20px,3vw,40px)]">
          <p className="text-[15px] font-semibold">Por ejemplo, necesitas…</p>
          <div role="radiogroup" aria-label="Ejemplos de necesidades" className="mt-4 flex flex-wrap gap-2">
            {NEEDS.map((x, i) => (
              <button
                key={x.key}
                type="button"
                role="radio"
                aria-checked={i === need}
                onClick={() => setNeed(i)}
                className={`h-10 rounded-full px-4 text-[15px] font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.97] ${i === need ? 'bg-[var(--sheet-ink)] text-[var(--sheet)]' : 'bg-black/[0.06] text-[var(--sheet-ink)] hover:bg-black/10'}`}
              >
                {x.label}
              </button>
            ))}
          </div>

          <div key={n.key} className="ln-swap mt-6 rounded-[20px] bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_8px_24px_rgb(0_0_0/0.06)]">
            <p className="text-[13px] font-medium text-[var(--sheet-ink-2)]">Petición a medida</p>
            <p className="mt-1 text-[20px] leading-[1.25] font-semibold tracking-[-0.01em]">{n.label}</p>
            <p className="mt-1 text-[15px] leading-[1.5] text-[var(--sheet-ink-2)]">{n.detail}</p>
            <ol className="mt-5 flex flex-col gap-3" aria-live="polite">
              {STEPS.map((s, i) => {
                const done = i <= step;
                return (
                  <li key={s} className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-[background-color,color,scale] duration-300 ${done ? 'scale-100 bg-[#30d158] text-white' : 'scale-90 bg-black/[0.06] text-transparent'}`}
                    >
                      <Check className="size-4" strokeWidth={3} />
                    </span>
                    <span className={`text-[16px] transition-colors duration-300 ${done ? 'font-semibold text-[var(--sheet-ink)]' : 'text-[var(--sheet-ink-2)]'}`}>{s}</span>
                    <span className="sr-only">{done ? '(hecho)' : '(pendiente)'}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
