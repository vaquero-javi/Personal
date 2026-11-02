import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatEuro } from '@/lib/format';

/** Cifra clave: valor grande, etiqueta y, si hay, comparación con el periodo anterior. */
export function Kpi({ label, value, delta, invert = false, note }: { label: string; value: string; delta?: number | null; invert?: boolean; note?: ReactNode }) {
  // invert: en gastos, subir es malo.
  const good = delta == null ? null : invert ? delta <= 0 : delta >= 0;
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-sheet px-4 py-4 md:px-5">
      <p className="text-xs font-semibold text-ink-3">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {delta != null && (
        <p className={`text-xs font-semibold ${good ? 'text-ok' : 'text-danger'}`}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {Math.abs(delta).toLocaleString('es-ES')} % <span className="font-normal text-ink-3">vs. periodo anterior</span>
        </p>
      )}
      {note && <p className="text-xs text-ink-3">{note}</p>}
    </div>
  );
}

/** Filtros en forma de píldoras, como en el resto de la app. */
export function Pills({ items, current, href }: { items: readonly { value: string; label: string }[]; current: string; href: (value: string) => string }) {
  return (
    <nav aria-label="Periodo" className="flex flex-wrap gap-2 text-sm">
      {items.map((i) => (
        <Link key={i.value} href={href(i.value)} aria-current={current === i.value ? 'true' : undefined} className="rounded-full border border-line px-3 py-1 aria-[current]:border-ink aria-[current]:bg-ink aria-[current]:text-white">
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** Años desde el actual hacia atrás. */
export const yearOptions = (current: number, n = 4) => Array.from({ length: n }, (_, i) => String(current - i)).map((y) => ({ value: y, label: y }));

/** Fila de un estado contable: concepto y columnas de importes. */
export function StatementRow({ label, values, level = 'line', hint, extra }: { label: string; values: (number | null)[]; level?: 'line' | 'sub' | 'total' | 'result'; hint?: string; extra?: ReactNode }) {
  const strong = level === 'total' || level === 'result';
  return (
    <tr className={`${level === 'result' ? 'border-t-2 border-ink' : level === 'total' ? 'border-t border-line' : 'border-t border-line-soft'}`}>
      <th scope="row" className={`py-2 pr-4 text-left ${strong ? 'font-bold' : level === 'sub' ? 'pl-4 font-normal text-ink-2' : 'font-normal'}`}>
        {label}
        {hint && <span className="block text-xs font-normal text-ink-3">{hint}</span>}
      </th>
      {values.map((v, i) => (
        <td key={i} className={`py-2 pl-4 text-right tabular-nums whitespace-nowrap ${strong ? 'font-bold' : ''} ${v !== null && v < 0 && strong ? 'text-danger' : ''}`}>
          {v === null ? '—' : formatEuro(v)}
        </td>
      ))}
      {extra !== undefined && <td className="py-2 pl-4 text-right text-ink-2 tabular-nums whitespace-nowrap">{extra}</td>}
    </tr>
  );
}

/** Aviso fijo: son cifras de gestión, no contabilidad oficial. */
export function ManagementNote({ children }: { children?: ReactNode }) {
  return (
    <p className="text-xs text-ink-3">
      Cifras de gestión calculadas con lo registrado en Omnia (facturas emitidas y recibidas, cobros, pagos y nóminas subidas). No sustituyen a la contabilidad oficial.
      {children && <> {children}</>}
    </p>
  );
}
