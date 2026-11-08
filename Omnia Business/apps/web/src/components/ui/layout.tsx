import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft, CircleCheck } from 'lucide-react';
import type { Tone } from '@/lib/labels';

/** Cabecera de pantalla con título grande (Large Title), contexto y acciones. */
export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 pt-2 md:flex-row md:items-end md:pt-4">
      <div className="min-w-0 flex-1">
        {back && (
          <Link href={back.href} className="pressable -ml-1.5 mb-1 inline-flex h-8 items-center gap-0.5 rounded-full pr-2.5 pl-0.5 text-[15px] text-tint hover:bg-fill">
            <ChevronLeft aria-hidden className="size-[22px]" strokeWidth={2.2} />
            {back.label}
          </Link>
        )}
        <h2 className="text-[28px] leading-[1.15] font-bold tracking-[-0.022em] md:text-[32px]">{title}</h2>
        {description && <p className="mt-1 text-[15px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Tarjeta agrupada (inset grouped). Sola o dentro de <Ruled>. */
export function Cell({ title, actions, className = '', children }: { title?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-[var(--radius-card)] bg-sheet px-4 py-4 shadow-[var(--shadow-card)] md:px-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex min-h-7 items-center gap-3">
          {title && <h3 className="min-w-0 text-[17px] font-semibold">{title}</h3>}
          {actions && <div className="ml-auto flex shrink-0 gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Rejilla de tarjetas. */
export function Ruled({ cols = 'md:grid-cols-[repeat(2,minmax(0,1fr))]', className = '', children }: { cols?: string; className?: string; children: ReactNode }) {
  return <div className={`grid grid-cols-[minmax(0,1fr)] gap-4 md:gap-5 ${cols} ${className}`}>{children}</div>;
}

const toneClass: Record<Tone, string> = {
  neutral: 'bg-fill text-ink-2',
  info: 'bg-tint-soft text-tint',
  ok: 'bg-ok-soft text-ok',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  muted: 'bg-fill text-ink-3',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ${toneClass[tone]}`}>{children}</span>;
}

export function StatusBadge({ map, value }: { map: Record<string, readonly [string, Tone]>; value: string }) {
  const [label, tone] = map[value] ?? [value, 'neutral' as Tone];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Vacío que enseña qué aparecerá y cómo empezar. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[14px] text-ink-3">
      <CircleCheck aria-hidden className="mb-1 size-9 text-ink-3/60" strokeWidth={1.5} />
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      {children && <div className="max-w-sm">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Lista de definición compacta para fichas (etiqueta / valor). */
export function Facts({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <dl className="-my-1 divide-y divide-line-soft text-[14px]">
      {items.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 py-2.5">
          <dt className="text-ink-3">{label}</dt>
          <dd className="min-w-0 text-right break-words">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
