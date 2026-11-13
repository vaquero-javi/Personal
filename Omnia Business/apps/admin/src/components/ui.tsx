// Piezas del sistema visual de la web (DESIGN.md), copiadas para que el panel
// no dependa del código de apps/web.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft, CircleAlert, CircleCheck } from 'lucide-react';

export type Tone = 'neutral' | 'info' | 'ok' | 'warning' | 'danger' | 'muted';

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

export function Notice({ tone, children }: { tone: 'danger' | 'ok' | 'warning'; children: ReactNode }) {
  const styles = { danger: 'bg-danger-soft text-danger', ok: 'bg-ok-soft text-ok', warning: 'bg-warning-soft text-warning' }[tone];
  const Icon = tone === 'ok' ? CircleCheck : CircleAlert;
  return (
    <p role={tone === 'danger' ? 'alert' : 'status'} className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[14px] font-medium ${styles}`}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export const inputClass =
  'h-9 w-full rounded-[10px] border-0 bg-fill px-3 text-[15px] text-ink transition-shadow duration-150 placeholder:text-ink-3 focus:bg-sheet focus:ring-[3px] focus:ring-tint/45 focus:outline-none disabled:text-ink-3 disabled:opacity-60';

export function PageHeader({ title, description, back }: { title: ReactNode; description?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="pt-2 md:pt-4">
      {back && (
        <Link href={back.href} className="pressable -ml-1.5 mb-1 inline-flex h-8 items-center gap-0.5 rounded-full pr-2.5 pl-0.5 text-[15px] text-tint hover:bg-fill">
          <ChevronLeft aria-hidden className="size-[22px]" strokeWidth={2.2} />
          {back.label}
        </Link>
      )}
      <h2 className="text-[28px] leading-[1.15] font-bold tracking-[-0.022em] md:text-[32px]">{title}</h2>
      {description && <p className="mt-1 text-[15px] text-ink-3">{description}</p>}
    </header>
  );
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

export function Table({ children, minWidth = 640 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="-mx-4 overflow-x-auto md:-mx-5 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] md:[mask-image:none]">
      <table className="w-full border-collapse text-[14px]" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, align = 'left', className = '' }: { children?: ReactNode; align?: keyof typeof ALIGN; className?: string }) {
  return (
    <th scope="col" className={`border-b border-line-soft px-2 pt-1 pb-2 text-[12px] font-medium whitespace-nowrap text-ink-3 first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5 ${ALIGN[align]} ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', className = '' }: { children?: ReactNode; align?: keyof typeof ALIGN; className?: string }) {
  return <td className={`border-b border-line-soft px-2 py-2.5 align-middle group-last/row:border-b-0 first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5 ${ALIGN[align]} ${className}`}>{children}</td>;
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="group/row relative transition-colors duration-100 hover:bg-fill/60 active:bg-fill">{children}</tr>;
}

export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-ink after:absolute after:inset-0">
      {children}
    </Link>
  );
}
