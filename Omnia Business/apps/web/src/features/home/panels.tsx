import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, CircleCheck } from 'lucide-react';

// El panel es UNA hoja pautada: las regiones no son tarjetas, son casillas
// separadas por filetes (la rejilla padre pinta `gap-px` sobre `bg-line`).

const cell = 'bg-sheet px-4 py-3.5 md:px-5';

export function Panel({
  title,
  action,
  className = '',
  children,
}: {
  title: string;
  action?: { label: string; href: string };
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col ${cell} ${className}`}>
      <div className="mb-2.5 flex items-center gap-3">
        <h2 className="min-w-0 text-sm font-bold">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded text-xs font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline"
          >
            {action.label}
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Indicador con su límite al lado: la cifra nunca aparece sola. */
export function Gauge({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: string;
  detail: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={`min-w-0 ${cell}`}>
      <h2 className="text-xs font-semibold text-ink-3">{label}</h2>
      <p className="mt-1.5 text-right text-[26px] leading-tight font-bold">{value}</p>
      <p className="mt-1 text-right text-sm text-ink-3">{detail}</p>
      {children}
    </section>
  );
}

/**
 * Barra de cantidad frente a su límite. Los colores de estado nunca son los de
 * los lomos: el color de un lomo identifica una sociedad y nada más.
 */
export function LimitBar({ value, tone, label }: { value: number; tone: 'ok' | 'neutral' | 'danger'; label: string }) {
  const fill = { ok: 'bg-ok', neutral: 'bg-ink-2', danger: 'bg-danger' }[tone];
  const width = Math.max(0, Math.min(100, value));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={width}
      className="mt-2.5 h-1.5 rounded-full bg-carton"
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${width}%` }} />
    </div>
  );
}

/** Vacío que explica qué aparecería aquí, no un «sin datos». */
export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded bg-sheet-head px-3 py-3 text-sm text-ink-2">
      <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />
      <span>{children}</span>
    </p>
  );
}
