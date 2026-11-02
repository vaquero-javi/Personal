import { todayIso } from '@/lib/format';

/** Periodos del cuadro de mando. Fechas YYYY-MM-DD; `to` es el primer día del último mes. */
export const PERIODS = [
  { value: 'mes', label: 'Este mes' },
  { value: 'trimestre', label: 'Este trimestre' },
  { value: 'anio', label: 'Este año' },
  { value: '12m', label: 'Últimos 12 meses' },
] as const;
export type PeriodKey = (typeof PERIODS)[number]['value'];

const iso = (y: number, m: number) => {
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
};

export interface Range {
  from: string;
  to: string;
  /** El mismo tramo justo antes, para comparar. */
  prevFrom: string;
  prevTo: string;
}

export function periodRange(key: PeriodKey, today = todayIso()): Range {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  const span = key === 'mes' ? 1 : key === 'trimestre' ? 3 : 12;
  const start = key === 'mes' ? m : key === 'trimestre' ? m - (m % 3) : key === 'anio' ? 0 : m - 11;
  return {
    from: iso(y, start),
    to: iso(y, start + span - 1),
    prevFrom: iso(y, start - span),
    prevTo: iso(y, start - 1),
  };
}

export const parsePeriod = (raw: string | undefined): PeriodKey => (PERIODS.some((p) => p.value === raw) ? (raw as PeriodKey) : 'anio');

/** Año pedido en la URL, acotado a algo razonable; por defecto, el actual. */
export function parseYear(raw: string | undefined) {
  const current = Number(todayIso().slice(0, 4));
  const y = Number(raw);
  return Number.isInteger(y) && y >= 2000 && y <= current ? y : current;
}

/** Variación en % entre dos cifras; null si no hay base con la que comparar. */
export const change = (now: number, before: number) => (before === 0 ? null : Math.round(((now - before) / Math.abs(before)) * 1000) / 10);
