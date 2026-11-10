'use client';

import { useState } from 'react';
import { Badge, InvoiceFragment, LINE, Ui, eur } from './fragments';

function ClockInsFragment() {
  const rows = [
    { n: 'Lucía Martín', t: '07:58', s: 'ok' as const, l: 'A tiempo' },
    { n: 'Óscar Peña', t: '08:01', s: 'ok' as const, l: 'A tiempo' },
    { n: 'Iván Soler', t: '08:17', s: 'warning' as const, l: '17 min tarde' },
    { n: 'Ana Ruiz', t: '—', s: 'muted' as const, l: 'Vacaciones' },
  ];
  return (
    <Ui className="p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[17px] font-semibold tracking-[-0.01em]">Registro de jornada</p>
        <span className="text-[12px] text-ink-3">Hoy · 3 de 4 dentro</span>
      </div>
      <ul className="mt-2">
        {rows.map((r) => (
          <li key={r.n} className={`flex items-center gap-3 ${LINE.t} py-2`}>
            <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-fill text-[11px] font-semibold">
              {r.n.split(' ').map((w) => w[0]).join('')}
            </span>
            <span className="flex-1 font-medium">{r.n}</span>
            <span className="text-ink-3">{r.t}</span>
            <Badge tone={r.s}>{r.l}</Badge>
          </li>
        ))}
      </ul>
    </Ui>
  );
}

function ReceiptFragment() {
  const rows = [
    { n: 'Cable 2,5 mm²', q: 200, before: 86, u: 'm' },
    { n: 'Guantes de nitrilo, talla L', q: 12, before: 4, u: 'cajas' },
    { n: 'Palé europeo', q: 10, before: 0, u: 'ud' },
  ];
  return (
    <Ui className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[17px] font-semibold tracking-[-0.01em]">Albarán A-0412</p>
          <p className="text-[12px] text-ink-3">Suministros Norte · al almacén central</p>
        </div>
        <Badge tone="ok">Recibido</Badge>
      </div>
      <ul className="mt-2">
        {rows.map((r) => (
          <li key={r.n} className={`flex items-center gap-3 ${LINE.t} py-2`}>
            <span className="flex-1 font-medium">{r.n}</span>
            <span className="font-semibold text-ok">+{r.q}</span>
            <span className="w-[92px] text-right text-ink-3">
              {r.before} → <b className="text-ink">{r.before + r.q}</b> {r.u}
            </span>
          </li>
        ))}
      </ul>
    </Ui>
  );
}

function DayCloseFragment() {
  const tickets = 64;
  const sales = 2418.6;
  return (
    <Ui className="p-4">
      <p className="text-[17px] font-semibold tracking-[-0.01em]">Cierre del día</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          ['Ventas', eur(sales)],
          ['Tickets', String(tickets)],
          ['Ticket medio', eur(Math.round((sales / tickets) * 100) / 100)],
          ['Facturado', eur(855.47)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[10px] bg-fill px-3 py-2">
            <p className="text-[12px] text-ink-3">{k}</p>
            <p className="text-[18px] font-bold tracking-[-0.02em]">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-[10px] bg-ok-soft px-3 py-2 text-ok">
        <span className="font-semibold">Caja cuadrada</span>
        <span>Descuadre {eur(0)}</span>
      </div>
    </Ui>
  );
}

const STAGES = [
  { time: '08:00', name: 'Fichajes', clause: 'El equipo ficha la entrada.', Fragment: ClockInsFragment },
  { time: '11:30', name: 'Compras', clause: 'Llega un albarán. Sube el stock.', Fragment: ReceiptFragment },
  { time: '17:00', name: 'Facturas', clause: 'Emites. Queda registrada.', Fragment: InvoiceFragment },
  { time: '20:00', name: 'Cierre', clause: 'Cierras el día con las cifras.', Fragment: DayCloseFragment },
];

/** Un día de trabajo: el deslizador mueve la hora gigante, la frase y la pantalla. */
export function OneDay() {
  const [stage, setStage] = useState(0);
  const s = STAGES[stage]!;
  return (
    <section id="un-dia" aria-labelledby="ln-day-title" className="ln-field relative mt-[clamp(96px,12vw,200px)] overflow-hidden">
      <div className="ln-wrap ln-chapter relative z-10 pt-6">
        <span>Un día con Omnia</span>
        <span>Capítulo 05</span>
      </div>
      <h2 id="ln-day-title" className="sr-only">
        Un día con Omnia
      </h2>
      <p key={`h-${stage}`} aria-hidden className="ln-serif ln-ghost-hour ln-swap pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[clamp(120px,30vw,520px)] !leading-none">
        {s.time}
      </p>
      <div className="ln-wrap relative z-10 flex min-h-[calc(100svh-48px)] flex-col items-center pt-4 pb-8 text-center">
        <p aria-live="polite" key={`c-${stage}`} className="ln-serif ln-swap max-w-[16ch] text-[clamp(40px,6.4vw,108px)]">
          {s.clause}
        </p>
        <div key={`f-${stage}`} className="ln-swap my-auto w-full max-w-[440px] py-6 text-left">
          <s.Fragment />
        </div>
        <div className="w-full max-w-[920px]">
          <label className="block">
            <span className="sr-only">Hora del día</span>
            <input type="range" min={0} max={STAGES.length - 1} step={1} value={stage} onChange={(e) => setStage(Number(e.target.value))} aria-valuetext={`${s.time}, ${s.name}`} className="ln-range" />
          </label>
          <ol className="mt-2 grid grid-cols-4 text-[15px]">
            {STAGES.map((st, i) => (
              <li key={st.name} className={i === 0 ? 'text-left' : i === STAGES.length - 1 ? 'text-right' : 'text-center'}>
                <button type="button" onClick={() => setStage(i)} className={`rounded-md transition-opacity ${i === stage ? 'font-semibold' : 'opacity-60 hover:opacity-100'}`}>
                  <span className="tabular-nums">{st.time}</span> <span className="max-sm:hidden">{st.name}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
