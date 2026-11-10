'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChainFragment, CompaniesFragment, ClockFragment, PosFragment, StatsFragment, StockFragment, STOCK, TasksFragment, Tile, MODULE_TILES } from './fragments';

const MODS: { slug: string; label: string; lead: string; title: string; text: string; field: string; ink: string; ui: ReactNode }[] = [
  { slug: 'ventas', label: 'Ventas', lead: 'Para cobrar', title: 'En el mostrador o desde la tablet.', text: 'El TPV cobra con tarjeta o en efectivo, divide cuentas y lleva la caja del día con su cierre.', field: '#ff375f', ink: '#ffffff', ui: <PosFragment /> },
  { slug: 'facturacion', label: 'Facturación', lead: 'Para facturar', title: 'Con VeriFactu desde el primer día.', text: 'Cada factura se encadena con la anterior por su huella y lleva el QR tributario.', field: '#30d158', ink: '#04210d', ui: <ChainFragment /> },
  { slug: 'almacen', label: 'Almacén', lead: 'Para tu almacén', title: 'Sabes lo que tienes y lo que falta.', text: 'Albaranes y facturas de proveedor mueven el stock; los mínimos avisan antes de quedarte sin nada.', field: '#ffd60a', ink: '#2b2200', ui: <StockFragment rows={STOCK.slice(1, 4)} /> },
  { slug: 'rrhh', label: 'RRHH', lead: 'Para tu equipo', title: 'Fichajes, turnos, vacaciones y nóminas.', text: 'Fichan desde el móvil o con su tarjeta, y el registro de jornada se lleva solo.', field: '#5e5ce6', ink: '#ffffff', ui: <ClockFragment /> },
  { slug: 'tareas', label: 'Tareas', lead: 'Para el día a día', title: 'Lo pendiente, a la vista de todos.', text: 'Tareas con responsable y fecha, e incidencias con prioridad y comentarios. Prueba a marcar una.', field: '#40c8e0', ink: '#03242b', ui: <TasksFragment /> },
  { slug: 'estadisticas', label: 'Estadísticas', lead: 'Para decidir', title: 'Las cifras, sin hojas de cálculo.', text: 'Facturado, cobrado, gastos y liquidez por mes o trimestre. Pasa por encima de las barras.', field: '#bf5af2', ink: '#ffffff', ui: <StatsFragment /> },
  { slug: 'inicio', label: 'Sociedades', lead: 'Para tus empresas', title: 'Una cuenta, todas tus sociedades.', text: 'Cambias de empresa con un clic y cada una guarda sus datos aparte. Y la vista de grupo las suma.', field: '#0a84ff', ink: '#ffffff', ui: <CompaniesFragment /> },
];
const N = MODS.length;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** Proyección de inercia de Apple (Designing Fluid Interfaces): dónde acabaría un lanzamiento. */
const project = (velocity: number, rate = 0.998) => ((velocity / 1000) * rate) / (1 - rate);

/**
 * Los módulos como una tira horizontal fijada: el scroll vertical la hace
 * avanzar y también se puede arrastrar. Un muelle críticamente amortiguado
 * sigue al objetivo, así que todo parte de la posición actual y nunca salta.
 */
export function ModuleSheet() {
  const track = useRef<HTMLElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = track.current;
    const row = strip.current;
    if (!el || !row) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return;

    // Estado del muelle (en «tarjetas»: 0 = primera, N-1 = última).
    let x = 0;
    let v = 0;
    let target = 0;
    let last = performance.now();
    let raf = 0;
    let shown = -1;
    const RESPONSE = 0.42; // s, como el «response» de Apple
    const omega = (2 * Math.PI) / RESPONSE;

    const travel = () => el.offsetHeight - innerHeight;
    const fromScroll = () => clamp(-el.getBoundingClientRect().top / travel(), 0, 1) * (N - 1);
    const scrollFor = (pos: number) => el.offsetTop + (clamp(pos, 0, N - 1) / (N - 1)) * travel();

    const paint = () => {
      const cards = row.children;
      const cardW = (cards[0] as HTMLElement | undefined)?.offsetWidth ?? 1;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      row.style.transform = `translate3d(${-x * (cardW + gap)}px,0,0)`;
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i] as HTMLElement;
        const d = i - x;
        const a = Math.min(Math.abs(d), 1.6);
        card.style.transform = `perspective(1600px) rotateY(${clamp(d, -1.4, 1.4) * -16}deg) scale(${1 - Math.min(a, 1) * 0.14})`;
        card.style.opacity = String(1 - Math.max(0, a - 0.35) * 0.45);
        const ui = card.querySelector<HTMLElement>('[data-parallax]');
        if (ui) ui.style.transform = `translate3d(${clamp(d, -1.5, 1.5) * 90}px,0,0) rotate(${clamp(d, -1, 1) * 3}deg)`;
      }
      if (bar.current) bar.current.style.transform = `scaleX(${(x + 1) / N})`;
      const now = Math.round(clamp(x, 0, N - 1));
      if (now !== shown) {
        shown = now;
        setActive(now);
      }
    };

    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!dragging) target = fromScroll();
      // Muelle con amortiguamiento crítico (damping 1): sin rebote, sin saltos.
      const accel = omega * omega * (target - x) - 2 * omega * v;
      v += accel * dt;
      x += v * dt;
      if (Math.abs(target - x) < 0.0005 && Math.abs(v) < 0.0005) {
        x = target;
        v = 0;
      }
      paint();
      raf = requestAnimationFrame(tick);
    };

    // --- Arrastre directo: 1:1 con el dedo, con inercia al soltar.
    let dragging = false;
    let pending: { id: number; x0: number; y0: number; start: number } | null = null;
    let history: { t: number; px: number }[] = [];
    let suppressClick = false;
    const cardStep = () => {
      const c = row.children[0] as HTMLElement | undefined;
      return (c?.offsetWidth ?? 1) + (parseFloat(getComputedStyle(row).columnGap) || 0);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pending = { id: e.pointerId, x0: e.clientX, y0: e.clientY, start: target };
      history = [{ t: e.timeStamp, px: e.clientX }];
    };
    const onMove = (e: PointerEvent) => {
      if (!pending || e.pointerId !== pending.id) return;
      const dx = e.clientX - pending.x0;
      const dy = e.clientY - pending.y0;
      if (!dragging) {
        // Histéresis de 10 px y solo si el gesto es horizontal.
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
        dragging = true;
        suppressClick = true;
        row.setPointerCapture(e.pointerId);
      }
      history.push({ t: e.timeStamp, px: e.clientX });
      if (history.length > 6) history.shift();
      let pos = pending.start - dx / cardStep();
      // Resistencia en los extremos (rubber-band) en vez de un tope seco.
      if (pos < 0) pos = -(-pos * 0.55) / (1 + -pos * 0.55);
      if (pos > N - 1) pos = N - 1 + ((pos - N + 1) * 0.55) / (1 + (pos - N + 1) * 0.55);
      target = pos;
    };
    const onUp = (e: PointerEvent) => {
      if (!pending || e.pointerId !== pending.id) return;
      pending = null;
      if (!dragging) return;
      dragging = false;
      const h = history;
      const first = h[0]!;
      const lastP = h[h.length - 1]!;
      const vpx = (lastP.px - first.px) / Math.max(1, lastP.t - first.t) * 1000; // px/s
      // Se proyecta la inercia y se elige la tarjeta más cercana a donde «caería».
      const landing = clamp(Math.round(target - project(vpx) / cardStep()), 0, N - 1);
      target = landing;
      v = -vpx / cardStep(); // se hereda la velocidad del dedo
      window.scrollTo({ top: scrollFor(landing), behavior: 'instant' as ScrollBehavior });
      setTimeout(() => (suppressClick = false), 0);
    };
    const onClick = (e: MouseEvent) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    row.addEventListener('pointerdown', onDown);
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onUp);
    row.addEventListener('click', onClick, true);
    x = target = fromScroll();
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      row.removeEventListener('pointerdown', onDown);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onUp);
      row.removeEventListener('click', onClick, true);
    };
  }, []);

  return (
    <section ref={track} id="modulos" aria-labelledby="ln-mod-title" className="ln-mods-track mt-[clamp(80px,10vw,160px)]">
      <div className="ln-mods-stage flex flex-col">
        <div className="ln-wrap ln-chapter pt-6">
          <span>Módulos</span>
          <span>Capítulo 03</span>
        </div>
        <h2 id="ln-mod-title" className="ln-serif ln-wrap mt-3 max-w-[22ch] text-[clamp(38px,4.8vw,84px)]">
          Empieza por uno. Acaba usándolos todos.
        </h2>

        <div className="ln-mods-viewport relative mt-[clamp(16px,3vh,36px)] min-h-0 flex-1">
          <div ref={strip} className="ln-mods-strip" aria-roledescription="carrusel" aria-label="Módulos de Omnia">
            {MODS.map((m, i) => {
              const tile = MODULE_TILES.find((t) => t.slug === m.slug)!;
              return (
                <article
                  key={m.slug}
                  className="ln-mod-card"
                  style={{ background: m.field, color: m.ink }}
                  aria-roledescription="módulo"
                  aria-label={`${i + 1} de ${N}: ${m.label}`}
                  aria-current={i === active ? 'true' : undefined}
                >
                  <div className="flex min-w-0 flex-col justify-between gap-6">
                    <div>
                      <p className="flex items-center gap-2.5 text-[15px] font-semibold">
                        <span className="rounded-[8px] bg-white/25 p-1">
                          <Tile Icon={tile.Icon} tile="bg-transparent" size={22} />
                        </span>
                        {m.lead}
                        <span className="ml-auto tabular-nums opacity-70">
                          {String(i + 1).padStart(2, '0')} / {String(N).padStart(2, '0')}
                        </span>
                      </p>
                      <h3 className="ln-serif mt-[clamp(14px,2.4vh,28px)] text-[clamp(32px,3.8vw,64px)]">{m.title}</h3>
                    </div>
                    <p className="max-w-[40ch] text-[17px] leading-[1.5] font-medium opacity-90">{m.text}</p>
                  </div>
                  <div className="flex items-center justify-center">
                    <div data-parallax className="w-full max-w-[400px] will-change-transform">
                      {m.ui}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="ln-wrap pt-4 pb-6">
          <div className="relative h-[3px] overflow-hidden rounded-full bg-white/12">
            <div ref={bar} className="absolute inset-0 origin-left rounded-full bg-[var(--pill)]" style={{ transform: `scaleX(${1 / N})` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
