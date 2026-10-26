import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import type { Tone } from '@/lib/labels';

/** Cabecera de una pantalla dentro de la hoja: título, contexto y acciones. */
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
    <header className="flex flex-col gap-3 border-b border-line px-4 py-4 md:flex-row md:items-end md:px-5">
      <div className="min-w-0 flex-1">
        {back && (
          <Link href={back.href} className="mb-1.5 inline-flex items-center gap-1 rounded text-xs font-medium text-ink-2 hover:text-ink hover:underline">
            <ArrowLeft aria-hidden className="size-3.5" />
            {back.label}
          </Link>
        )}
        <h2 className="text-lg font-bold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Casilla de la hoja pautada. Usar dentro de <Ruled>. */
export function Cell({ title, actions, className = '', children }: { title?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`min-w-0 bg-sheet px-4 py-4 md:px-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center gap-3">
          {title && <h3 className="min-w-0 text-sm font-bold">{title}</h3>}
          {actions && <div className="ml-auto flex shrink-0 gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Rejilla de casillas separadas por filetes (gap-px sobre el color de línea). */
export function Ruled({ cols = 'md:grid-cols-[repeat(2,minmax(0,1fr))]', className = '', children }: { cols?: string; className?: string; children: ReactNode }) {
  return <div className={`grid grid-cols-[minmax(0,1fr)] gap-px border-b border-line bg-line ${cols} ${className}`}>{children}</div>;
}

const toneClass: Record<Tone, string> = {
  neutral: 'bg-carton text-ink-2',
  // Sin color: el azul es el lomo de una sociedad. «En curso» se dice con un contorno de tinta.
  info: 'bg-sheet text-ink ring-1 ring-shelf-edge',
  ok: 'bg-[#e9f4ec] text-ok',
  warning: 'bg-warning-soft text-warning ring-1 ring-warning-line',
  danger: 'bg-danger text-white',
  muted: 'bg-sheet-head text-ink-3',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${toneClass[tone]}`}>{children}</span>;
}

export function StatusBadge({ map, value }: { map: Record<string, readonly [string, Tone]>; value: string }) {
  const [label, tone] = map[value] ?? [value, 'neutral' as Tone];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Vacío que enseña qué aparecerá y cómo empezar. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded bg-sheet-head px-4 py-5 text-sm text-ink-2">
      <p className="flex items-center gap-2 font-semibold text-ink">
        <CircleCheck aria-hidden className="size-4 text-ok" />
        {title}
      </p>
      {children && <div className="max-w-prose">{children}</div>}
      {action}
    </div>
  );
}

/** Lista de definición compacta para fichas (etiqueta / valor). */
export function Facts({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-3">{label}</dt>
          <dd className="min-w-0 break-words">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
