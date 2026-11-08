'use client';

import { useState } from 'react';

/** Colores del sistema: tinta y gris (los lomos no se usan en gráficos) y rojo de estado para pérdidas. */
export const CHART_INK = 'var(--color-tint)';
export const CHART_GRAY = 'var(--color-sys-gray)';
export const CHART_LOSS = 'var(--color-sys-red)';

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 });

/** Marcas «redondas» para el eje: 1, 2, 2,5 o 5 por potencia de diez. */
function niceTicks(min: number, max: number, count = 4) {
  const span = Math.max(max - min, 1);
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * pow).find((s) => s >= raw)!;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/**
 * Barras agrupadas por mes, con un solo eje. Hover (o foco) sobre un mes
 * enseña sus cifras; debajo, la tabla con los mismos datos.
 * Con `lossColor`, una barra negativa de una serie única se pinta de pérdida.
 */
export function BarChart({ title, labels, series, lossColor, height = 220 }: {
  title: string;
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
  lossColor?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const lo = ticks[0]!;
  const hi = ticks[ticks.length - 1]!;

  const W = 640;
  const left = 44;
  const bottom = 22;
  const plotH = height - bottom - 8;
  const y = (v: number) => 8 + ((hi - v) / (hi - lo || 1)) * plotH;
  const band = (W - left) / labels.length;
  const gap = 2;
  const barW = Math.max(3, Math.min(18, (band * 0.7 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);

  // Barra con las esquinas del extremo redondeadas (4px) y pegada a la línea base.
  const bar = (x: number, v: number) => {
    const y0 = y(0);
    const y1 = y(v);
    const h = Math.abs(y1 - y0);
    if (h < 0.5) return '';
    const r = Math.min(4, h, barW / 2);
    return v >= 0
      ? `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 + r} V${y0} Z`
      : `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 - r} V${y0} Z`;
  };

  return (
    <figure className="flex flex-col gap-2">
      {series.length > 1 && (
        <figcaption className="flex flex-wrap gap-4 text-xs text-ink-2">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
        </figcaption>
      )}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title} className="w-full overflow-visible" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--color-line)' : 'var(--color-line-soft)'} strokeWidth={1} />
              <text x={left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[10px]">{compact.format(t)}</text>
            </g>
          ))}
          {labels.map((label, i) => {
            const x0 = left + i * band + (band - groupW) / 2;
            return (
              <g key={label} opacity={hover === null || hover === i ? 1 : 0.45}>
                {series.map((s, j) => {
                  const v = s.values[i] ?? 0;
                  const fill = lossColor && v < 0 ? lossColor : s.color;
                  return <path key={s.name} d={bar(x0 + j * (barW + gap), v)} fill={fill} />;
                })}
                <text x={left + i * band + band / 2} y={height - 6} textAnchor="middle" className="fill-ink-3 text-[10px]">{label}</text>
                {/* Zona de hover mayor que las barras. */}
                <rect
                  x={left + i * band}
                  y={0}
                  width={band}
                  height={height}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${label}: ${series.map((s) => `${s.name} ${euro.format(s.values[i] ?? 0)}`).join(', ')}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 material rounded-[10px] px-3 py-2 text-xs shadow-[var(--shadow-float)]"
            style={{ left: `${((left + hover * band + band / 2) / W) * 100}%` }}
          >
            <p className="mb-1 font-semibold text-ink">{labels[hover]}</p>
            {series.map((s) => (
              <p key={s.name} className="flex items-center justify-between gap-3 text-ink-2">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-sm" style={{ backgroundColor: lossColor && (s.values[hover] ?? 0) < 0 ? lossColor : s.color }} />
                  {s.name}
                </span>
                <span className="font-semibold text-ink tabular-nums">{euro.format(s.values[hover] ?? 0)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <details className="text-xs text-ink-2">
        <summary className="cursor-pointer select-none">Ver los datos en tabla</summary>
        <table className="mt-2 w-full text-right tabular-nums">
          <thead>
            <tr className="text-ink-3">
              <th className="py-1 text-left font-semibold">Mes</th>
              {series.map((s) => <th key={s.name} className="py-1 font-semibold">{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={label} className="border-t border-line-soft">
                <td className="py-1 text-left">{label}</td>
                {series.map((s) => <td key={s.name} className="py-1">{euro.format(s.values[i] ?? 0)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
