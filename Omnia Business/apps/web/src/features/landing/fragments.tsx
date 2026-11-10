'use client';

/*
 * Fragmentos de la interfaz real de Omnia para la página de inicio: mismas
 * piezas (tarjetas, chips de estado, segmentados, baldosas de módulo) y
 * cifras de ejemplo que cuadran. Cada raíz lleva `data-ui`: dentro rigen las
 * convenciones de la app, no las de la página.
 */

import { useState, type ReactNode } from 'react';
import { Check, Clock } from 'lucide-react';

export { MODULE_TILES, Tile } from './tiles';

/** Separadores y relieve de la propia app: solo dentro de los fragmentos `data-ui`. */
export const LINE = { t: 'border-t border-line-soft', b: 'border-b border-line-soft', l: 'border-l border-line-soft', tl: 'border-t border-l border-line-soft', raised: 'shadow-[var(--shadow-raised)]' }; // taste-skill-ignore: interior de data-ui

export const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(n);

export function Ui({ className = '', children, label }: { className?: string; children: ReactNode; label?: string }) {
  return (
    <div data-ui role={label ? 'img' : undefined} aria-label={label} className={`rounded-[14px] bg-sheet text-[13px] text-ink shadow-[var(--shadow-card)] tabular-nums ${className}`}>
      {children}
    </div>
  );
}

const toneClass = {
  ok: 'bg-ok-soft text-ok',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-tint-soft text-tint',
  muted: 'bg-fill text-ink-3',
} as const;
export type Tone = keyof typeof toneClass;

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex h-5 items-center rounded-full px-2 text-[12px] font-semibold whitespace-nowrap ${toneClass[tone]}`}>{children}</span>;
}

/* ---------------------------------------------------------------- Inicio */

const WEEK = [
  { d: 'L', v: 1840 },
  { d: 'M', v: 2105 },
  { d: 'X', v: 1690 },
  { d: 'J', v: 2380 },
  { d: 'V', v: 3120 },
  { d: 'S', v: 2760 },
  { d: 'D', v: 2418.6 },
];

export function DashboardFragment() {
  const [hover, setHover] = useState(6);
  const max = Math.max(...WEEK.map((w) => w.v));
  return (
    <Ui className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[17px] font-semibold tracking-[-0.01em]">Inicio</p>
        <p className="text-[12px] text-ink-3">Domingo, 15 nov</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { k: 'Ventas de hoy', v: eur(2418.6), d: '+12 % vs. domingo pasado', t: 'text-ok' },
          { k: 'Por cobrar', v: eur(6930), d: '4 facturas', t: 'text-ink-3' },
          { k: 'Fichados ahora', v: '7 de 9', d: '2 de descanso', t: 'text-ink-3' },
        ].map((g) => (
          <div key={g.k} className="rounded-[10px] bg-fill px-2.5 py-2">
            <p className="text-[12px] text-ink-3">{g.k}</p>
            <p className="text-[18px] font-bold tracking-[-0.02em]">{g.v}</p>
            <p className={`text-[11px] ${g.t}`}>{g.d}</p>
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="mb-1 text-[12px] text-ink-3">
          Ventas · {WEEK[hover]!.d === 'D' ? 'hoy' : `día ${WEEK[hover]!.d}`}: <b className="text-ink">{eur(WEEK[hover]!.v)}</b>
        </p>
        <div className="flex min-h-0 flex-1 items-end gap-1.5">
          {WEEK.map((w, i) => (
            <button
              key={w.d}
              type="button"
              tabIndex={-1}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
              aria-label={`${w.d}: ${eur(w.v)}`}
            >
              <span style={{ height: `${(w.v / max) * 100}%` }} className={`w-full min-h-1 rounded-t-[4px] transition-colors ${i === hover ? 'bg-tint' : 'bg-tint/25'}`} />
              <span className="text-[11px] text-ink-3">{w.d}</span>
            </button>
          ))}
        </div>
      </div>
    </Ui>
  );
}

/* --------------------------------------------------------------- Factura */

export const INVOICE_LINES = [
  { name: 'Mantenimiento trimestral', q: 1, p: 450 },
  { name: 'Material eléctrico', q: 12, p: 18.5 },
  { name: 'Desplazamiento', q: 1, p: 35 },
];

export function InvoiceFragment() {
  const base = INVOICE_LINES.reduce((s, l) => s + l.q * l.p, 0);
  const vat = Math.round(base * 21) / 100;
  return (
    <Ui className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[17px] font-semibold tracking-[-0.01em]">Factura F-2026-0184</p>
          <p className="text-[12px] text-ink-3">Talleres Brío SL · vence el 15 dic</p>
        </div>
        <Badge tone="ok">Registrada en VeriFactu</Badge>
      </div>
      <table className="mt-3 w-full">
        <tbody>
          {INVOICE_LINES.map((l) => (
            <tr key={l.name} className={`${LINE.b}`}>
              <td className="py-1.5">{l.name}</td>
              <td className="py-1.5 text-right text-ink-3">{l.q} × {eur(l.p)}</td>
              <td className="py-1.5 pl-3 text-right font-medium">{eur(l.q * l.p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <QrMark />
        <dl className="grid grid-cols-[auto_auto] gap-x-4 text-right">
          <dt className="text-ink-3">Base</dt>
          <dd>{eur(base)}</dd>
          <dt className="text-ink-3">IVA 21 %</dt>
          <dd>{eur(vat)}</dd>
          <dt className="text-[15px] font-semibold">Total</dt>
          <dd className="text-[15px] font-bold">{eur(base + vat)}</dd>
        </dl>
      </div>
    </Ui>
  );
}

/** Código QR de verificación (dibujo determinista, no es un QR legible). */
export function QrMark({ size = 56 }: { size?: number }) {
  const n = 21;
  const cells: [number, number][] = [];
  let seed = 184;
  const finder = (x: number, y: number) => {
    const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
    return inBox(0, 0) || inBox(n - 7, 0) || inBox(0, n - 7);
  };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (finder(x, y)) continue;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if (seed % 7 < 3) cells.push([x, y]);
    }
  const box = (ox: number, oy: number) => (
    <g key={`${ox}-${oy}`}>
      <rect x={ox} y={oy} width={7} height={7} fill="currentColor" />
      <rect x={ox + 1} y={oy + 1} width={5} height={5} fill="var(--color-sheet)" />
      <rect x={ox + 2} y={oy + 2} width={3} height={3} fill="currentColor" />
    </g>
  );
  return (
    <div className="flex items-center gap-2">
      <svg aria-hidden viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges" className="text-ink">
        {cells.map(([x, y]) => (
          <rect key={`${x}.${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
        ))}
        {box(0, 0)}
        {box(n - 7, 0)}
        {box(0, n - 7)}
      </svg>
      <span className="text-[11px] leading-tight text-ink-3">
        QR tributario
        <br />
        VERI*FACTU
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- Turnos */

const ROTA = [
  { name: 'Lucía Martín', s: ['08:00–16:00', '08:00–16:00', '', '08:00–16:00', '08:00–14:00'] },
  { name: 'Iván Soler', s: ['', '14:00–22:00', '14:00–22:00', '14:00–22:00', '14:00–22:00'] },
  { name: 'Marta Gil', s: ['22:00–06:00+1', '22:00–06:00+1', '22:00–06:00+1', '', ''] },
  { name: 'Óscar Peña', s: ['09:00–17:00', '', '09:00–17:00', '09:00–17:00', '09:00–17:00'] },
];
const ROTA_DAYS = ['Lun 16', 'Mar 17', 'Mié 18', 'Jue 19', 'Vie 20'];

export function ShiftsFragment({ compact = false }: { compact?: boolean }) {
  const days = compact ? ROTA_DAYS.slice(0, 3) : ROTA_DAYS;
  return (
    <Ui className="h-full overflow-hidden">
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <p className="text-[17px] font-semibold tracking-[-0.01em]">Turnos</p>
        <p className="text-[12px] text-ink-3">Semana del 16 al 22 nov</p>
      </div>
      <table className="w-full table-fixed border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="w-[26%] px-2 py-1.5 pl-4 text-left font-semibold text-ink-3">Persona</th>
            {days.map((d, i) => (
              <th key={d} className={`${LINE.l} px-1.5 py-1.5 text-left font-semibold ${i === 0 ? 'bg-tint text-on-tint' : 'text-ink-3'}`}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROTA.map((p) => (
            <tr key={p.name}>
              <th scope="row" className={`truncate ${LINE.t} px-2 py-1.5 pl-4 text-left font-medium`}>
                {p.name}
              </th>
              {days.map((d, i) => {
                const s = p.s[i];
                const [time, next] = s ? s.split('+') : [];
                const [from, to] = time ? time.split('–') : [];
                return (
                  <td key={d} className={`h-11 ${LINE.tl} px-1 py-1 align-top`}>
                    {s && (
                      <span className="block rounded bg-carton px-1.5 py-0.5 leading-[1.25] font-semibold whitespace-nowrap">
                        {from}
                        <span className="block font-normal text-ink-2">
                          {to}
                          {next && <span className="ml-0.5 text-ink-3">+1</span>}
                        </span>
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Ui>
  );
}

/* --------------------------------------------------------------- Almacén */

export const STOCK = [
  { sku: 'TOR-M8', name: 'Tornillo M8 × 40', qty: 1240, min: 500, unit: 'ud' },
  { sku: 'CAB-25', name: 'Cable 2,5 mm²', qty: 86, min: 100, unit: 'm' },
  { sku: 'GUA-L', name: 'Guantes de nitrilo, talla L', qty: 4, min: 10, unit: 'cajas' },
  { sku: 'CIN-50', name: 'Cinta americana 50 mm', qty: 32, min: 12, unit: 'ud' },
  { sku: 'PAL-EU', name: 'Palé europeo', qty: 0, min: 6, unit: 'ud' },
];

export function StockFragment({ rows = STOCK }: { rows?: typeof STOCK }) {
  return (
    <Ui className="h-full overflow-hidden">
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <p className="text-[17px] font-semibold tracking-[-0.01em]">Almacén central</p>
        <Badge tone="warning">3 bajo mínimo</Badge>
      </div>
      <ul>
        {rows.map((r) => {
          const tone: Tone = r.qty === 0 ? 'danger' : r.qty < r.min ? 'warning' : 'ok';
          return (
            <li key={r.sku} className={`flex items-center gap-3 ${LINE.t} px-4 py-2`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.name}</span>
                <span className="text-[12px] text-ink-3">
                  {r.sku} · mínimo {r.min} {r.unit}
                </span>
              </span>
              <span className="font-semibold">
                {new Intl.NumberFormat('es-ES', { useGrouping: 'always' }).format(r.qty)} {r.unit}
              </span>
              <Badge tone={tone}>{tone === 'danger' ? 'Sin stock' : tone === 'warning' ? 'Bajo mínimo' : 'Bien'}</Badge>
            </li>
          );
        })}
      </ul>
    </Ui>
  );
}

/* ------------------------------------------------------------------- TPV */

const TICKET = [
  { name: 'Papel A4, 500 hojas', q: 2, p: 5.9 },
  { name: 'Cartucho de tinta negra', q: 1, p: 24.5 },
  { name: 'Bolígrafos azules, caja de 10', q: 1, p: 4.2 },
];

export function PosFragment() {
  const [method, setMethod] = useState<'Tarjeta' | 'Efectivo'>('Tarjeta');
  const total = TICKET.reduce((s, l) => s + l.q * l.p, 0);
  return (
    <Ui className="p-4">
      <p className="text-[17px] font-semibold tracking-[-0.01em]">Ticket T-0912</p>
      <ul className="mt-2">
        {TICKET.map((l) => (
          <li key={l.name} className={`flex justify-between ${LINE.b} py-1.5`}>
            <span>
              {l.q} × {l.name}
            </span>
            <span className="font-medium">{eur(l.q * l.p)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex items-baseline justify-between">
        <span className="text-ink-3">Total</span>
        <span className="text-[22px] font-bold tracking-[-0.02em]">{eur(total)}</span>
      </p>
      <div className="mt-2 grid grid-cols-2 gap-0.5 rounded-[10px] bg-fill p-0.5" role="radiogroup" aria-label="Forma de pago">
        {(['Tarjeta', 'Efectivo'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            onClick={() => setMethod(m)}
            className={`h-7 rounded-[8px] text-[13px] font-medium transition-colors ${method === m ? 'bg-sheet ${LINE.raised}' : 'text-ink-2 hover:text-ink'}`}
          >
            {m}
          </button>
        ))}
      </div>
      <span className="mt-2 flex h-9 items-center justify-center rounded-full bg-tint text-[14px] font-semibold text-on-tint">Cobrar {eur(total)} con {method.toLowerCase()}</span>
    </Ui>
  );
}

/* ------------------------------------------------------------ Fichaje */

export function ClockFragment() {
  const [state, setState] = useState<'out' | 'in'>('out');
  return (
    <Ui className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-[17px] font-semibold tracking-[-0.01em]">Fichar</p>
        <Badge tone={state === 'in' ? 'ok' : 'muted'}>{state === 'in' ? 'Trabajando desde las 08:02' : 'Fuera'}</Badge>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-ink-3">
        <Clock aria-hidden className="size-3.5" /> Tu turno de hoy: 08:00–16:00 · Almacén
      </p>
      <button
        type="button"
        onClick={() => setState((s) => (s === 'in' ? 'out' : 'in'))}
        className={`pressable mt-3 flex h-11 w-full items-center justify-center rounded-full text-[15px] font-semibold transition-colors ${state === 'in' ? 'bg-danger-soft text-danger' : 'bg-tint text-on-tint'}`}
      >
        {state === 'in' ? 'Fichar salida' : 'Fichar entrada'}
      </button>
      <p className="mt-2 text-center text-[12px] text-ink-3">{state === 'in' ? 'Entrada registrada a las 08:02 con ubicación' : 'Se guarda la hora y, si quieres, la ubicación'}</p>
    </Ui>
  );
}

/* ---------------------------------------------------------------- Tareas */

const TASKS = ['Revisar albarán de Suministros Norte', 'Enviar presupuesto a Clínica Vela', 'Cuadrar la caja del viernes', 'Renovar el seguro de la furgoneta'];

export function TasksFragment() {
  const [done, setDone] = useState<Set<number>>(() => new Set([0]));
  return (
    <Ui className="p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[17px] font-semibold tracking-[-0.01em]">Tareas de hoy</p>
        <span className="text-[12px] text-ink-3">
          {done.size} de {TASKS.length} hechas
        </span>
      </div>
      <ul className="mt-2">
        {TASKS.map((t, i) => {
          const on = done.has(i);
          return (
            <li key={t} className={`${LINE.t}`}>
              <label className="flex cursor-pointer items-center gap-2.5 py-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setDone((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  className="peer sr-only"
                />
                <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors peer-focus-visible:ring-[3px] peer-focus-visible:ring-tint/45 ${on ? 'border-sys-teal bg-sys-teal text-white' : 'border-line'}`}>
                  {on && <Check aria-hidden className="size-3" strokeWidth={3} />}
                </span>
                <span className={on ? 'text-ink-3 line-through' : ''}>{t}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </Ui>
  );
}

/* ----------------------------------------------------------- Incidencia */

export function IncidentFragment() {
  return (
    <Ui className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[15px] font-semibold">Fuga de agua en el almacén 2</p>
        <Badge tone="danger">Alta</Badge>
      </div>
      <p className="mt-1 text-ink-3">Abierta hoy a las 09:14 por Óscar Peña · asignada a Mantenimiento</p>
      <div className="mt-3 flex gap-1.5">
        <Badge tone="info">En curso</Badge>
                <Badge tone="muted">3 comentarios</Badge>
      </div>
    </Ui>
  );
}

/* ---------------------------------------------------------- Estadísticas */

const MONTHS = [
  { m: 'jun', v: 38.2 },
  { m: 'jul', v: 41.6 },
  { m: 'ago', v: 29.4 },
  { m: 'sep', v: 44.1 },
  { m: 'oct', v: 47.8 },
  { m: 'nov', v: 52.3 },
];

export function StatsFragment() {
  const [sel, setSel] = useState(MONTHS.length - 1);
  const max = Math.max(...MONTHS.map((m) => m.v));
  const cur = MONTHS[sel]!;
  const prev = MONTHS[sel - 1];
  const delta = prev ? Math.round(((cur.v - prev.v) / prev.v) * 100) : null;
  return (
    <Ui className="p-4">
      <p className="text-[13px] text-ink-3">Ventas de {cur.m}</p>
      <p className="text-[28px] font-bold tracking-[-0.02em]">
        {cur.v.toFixed(1).replace('.', ',')} mil €
        {delta !== null && <span className={`ml-2 text-[14px] font-semibold ${delta >= 0 ? 'text-ok' : 'text-danger'}`}>{delta >= 0 ? `+${delta}` : delta} %</span>}
      </p>
      <div className="mt-3 flex h-28 items-end gap-2">
        {MONTHS.map((m, i) => (
          <button key={m.m} type="button" onClick={() => setSel(i)} onMouseEnter={() => setSel(i)} aria-label={`${m.m}: ${m.v} mil euros`} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span style={{ height: `${(m.v / max) * 100}%` }} className={`w-full rounded-t-[5px] transition-colors ${i === sel ? 'bg-sys-purple' : 'bg-sys-purple/25'}`} />
            <span className="text-[11px] text-ink-3">{m.m}</span>
          </button>
        ))}
      </div>
    </Ui>
  );
}

/* ------------------------------------------------------------ Sociedades */

export const COMPANIES = [
  { name: 'Norte Servicios SL', color: 'bg-spine-blue' },
  { name: 'Norte Instalaciones SL', color: 'bg-spine-green' },
  { name: 'Distribuciones Norte SA', color: 'bg-spine-red' },
];

/* ------------------------------------------------- Registro y sociedades */

export function ChainFragment() {
  const rows = [
    { n: 'F-2026-0186', t: 326.7, h: '3F9A…E21C' },
    { n: 'F-2026-0187', t: 1452, h: 'B07D…41A8' },
    { n: 'F-2026-0188', t: 2178, h: '6C2E…9F05' },
  ];
  return (
    <Ui className="p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[17px] font-semibold tracking-[-0.01em]">Registro VeriFactu</p>
        <Badge tone="ok">Cadena correcta</Badge>
      </div>
      <ol className="mt-2">
        {rows.map((r, i) => (
          <li key={r.n} className={`flex items-center gap-3 ${LINE.t} py-2`}>
            <span className="flex size-6 items-center justify-center rounded-full bg-ok-soft text-ok">
              <Check aria-hidden className="size-3.5" strokeWidth={3} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{r.n}</span>
              <span className="text-[12px] text-ink-3">
                Huella {r.h}
                {i > 0 && ' · enlaza con la anterior'}
              </span>
            </span>
            <span className="font-semibold">{eur(r.t)}</span>
          </li>
        ))}
      </ol>
    </Ui>
  );
}

export function CompaniesFragment() {
  const [on, setOn] = useState(0);
  return (
    <Ui className="p-3">
      <p className="px-2 pb-1 text-[12px] font-semibold text-ink-3">Sociedades</p>
      <ul>
        {COMPANIES.map((c, i) => (
          <li key={c.name}>
            <button type="button" onClick={() => setOn(i)} className={`flex w-full items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-left text-[14px] ${i === on ? 'bg-fill font-semibold' : 'hover:bg-fill/60'}`}>
              <span aria-hidden className={`flex size-[22px] items-center justify-center rounded-full text-[11px] font-bold text-white ${c.color}`}>{c.name[0]}</span>
              {c.name}
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => setOn(-1)} className={`flex w-full items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-left text-[14px] ${on === -1 ? 'bg-fill font-semibold' : 'hover:bg-fill/60'}`}>
            <span aria-hidden className="flex size-[22px] items-center justify-center rounded-full bg-fill-strong text-[11px] font-bold">∑</span>
            Vista de grupo
          </button>
        </li>
      </ul>
      <p className="mt-2 rounded-[10px] bg-fill px-3 py-2 text-[13px]">
        {on === -1 ? 'Ventas del grupo este mes: 52.300,00 €' : `Abierta: ${COMPANIES[on]!.name}`}
      </p>
    </Ui>
  );
}

