import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight, CircleCheck } from 'lucide-react';

// Tarjetas agrupadas sobre el fondo de la ventana, al estilo de las apps de Apple.

const cell = 'rounded-[var(--radius-card)] bg-sheet px-4 py-4 shadow-[var(--shadow-card)] md:px-5';

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
      <div className="mb-2 flex items-center gap-3">
        <h2 className="min-w-0 font-sans text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="pressable ml-auto inline-flex shrink-0 items-center whitespace-nowrap gap-0.5 rounded-full py-1 pr-1 pl-2.5 text-[14px] text-tint hover:bg-fill"
          >
            {action.label}
            <ChevronRight aria-hidden className="size-4" strokeWidth={2.2} />
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
      <h2 className="font-sans text-[13px] font-medium tracking-normal text-ink-3">{label}</h2>
      <p className="mt-1 font-display text-[30px] leading-tight font-bold tracking-[-0.025em]">{value}</p>
      <p className="mt-0.5 text-[13px] text-ink-3">{detail}</p>
      {children}
    </section>
  );
}

/**
 * Barra de cantidad frente a su límite. Los colores de estado nunca son los de
 * los lomos: el color de un lomo identifica una sociedad y nada más.
 */
export function LimitBar({ value, tone, label }: { value: number; tone: 'ok' | 'neutral' | 'danger'; label: string }) {
  const fill = { ok: 'bg-sys-green', neutral: 'bg-tint', danger: 'bg-sys-red' }[tone];
  const width = Math.max(0, Math.min(100, value));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={width}
      className="mt-3 h-1.5 overflow-hidden rounded-full bg-fill"
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${width}%` }} />
    </div>
  );
}

/** Vacío que explica qué aparecería aquí, no un «sin datos». */
export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-xl bg-fill/60 px-3.5 py-3 text-[14px] text-ink-2">
      <CircleCheck aria-hidden className="mt-0.5 size-[18px] shrink-0 text-ok" />
      <span>{children}</span>
    </p>
  );
}
