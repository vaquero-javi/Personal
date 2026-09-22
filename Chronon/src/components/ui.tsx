import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'

const variants: Record<Variant, string> = {
  primary: 'bg-ink-900 text-ink-50 hover:bg-ink-800 disabled:opacity-40',
  accent: 'bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-40',
  secondary: 'bg-surface text-ink-800 shadow-soft ring-1 ring-ink-200 hover:bg-ink-50 disabled:opacity-50',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40',
  danger: 'text-red-600 hover:bg-red-50 disabled:opacity-40',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  const sizing = size === 'sm' ? 'h-8 px-3 text-[13px] rounded-lg' : 'h-10 px-4 text-sm rounded-xl'
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 font-medium transition-[background-color,color,transform,box-shadow] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${sizing} ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export function IconButton({
  icon,
  label,
  active = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`grid size-9 place-items-center rounded-xl transition-colors duration-200 active:scale-95 ${active ? 'bg-accent-50 text-accent-600' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900'} ${className}`}
      {...props}
    >
      <Icon name={icon} />
    </button>
  )
}

export const inputClass =
  'w-full h-10 rounded-xl border border-ink-200 bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 outline-none transition-[border-color,box-shadow] duration-200 hover:border-ink-300 focus:border-accent-400 focus:ring-4 focus:ring-accent-100 [&:is(textarea)]:h-auto [&:is(textarea)]:py-2.5'

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-[13px] font-medium text-ink-600">{label}</span>
      {children}
    </label>
  )
}

/** Título de página: serif editorial con una línea de contexto opcional encima. */
export function PageHeader({ eyebrow, title, children }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-x-4 gap-y-3 pb-2">
      <div className="mr-auto min-w-0">
        {eyebrow && <p className="mb-1 text-[13px] text-ink-500 first-letter:uppercase">{eyebrow}</p>}
        <h1 className="font-display text-4xl leading-none tracking-tight text-ink-900 sm:text-[2.75rem]">{title}</h1>
      </div>
      {children}
    </header>
  )
}

export function Card({ title, action, children, className = '' }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-surface p-5 shadow-soft ring-1 ring-ink-200/70 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium text-ink-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Empty({ children, icon }: { children: ReactNode; icon?: IconName }) {
  return (
    <div className="flex items-center gap-3 py-3 text-sm text-ink-500">
      {icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-400">
          <Icon name={icon} size={17} />
        </span>
      )}
      <p>{children}</p>
    </div>
  )
}

/** Esqueleto de carga con la forma de una lista de filas. */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-1" aria-label="Cargando" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex animate-shimmer items-center gap-3" style={{ animationDelay: `${i * 120}ms` }}>
          <span className="size-2.5 rounded-full bg-ink-200" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 rounded-full bg-ink-200" style={{ width: `${70 - i * 12}%` }} />
            <div className="h-2.5 w-1/3 rounded-full bg-ink-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Control segmentado (pestañas compactas). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = '',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
}) {
  return (
    <div className={`inline-flex rounded-xl bg-ink-100 p-0.5 text-[13px] ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 transition-[background-color,color,box-shadow] duration-200 ${value === o.value ? 'bg-surface font-medium text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-800'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Filtro activable (chip). */
export function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-colors duration-200 ${on ? 'bg-ink-900 text-ink-50' : 'text-ink-500 ring-1 ring-inset ring-ink-200 hover:text-ink-800'}`}
    >
      {children}
    </button>
  )
}

export const COLORS = ['#d45f32', '#3b6ea8', '#4f8a67', '#c9962c', '#8a5a9e', '#c4526e', '#3f8f8f', '#6b675f']

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Color ${c}`}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={`grid size-7 place-items-center rounded-lg text-white transition-transform duration-200 hover:scale-110 ${value === c ? 'ring-2 ring-ink-900 ring-offset-2 ring-offset-surface' : ''}`}
          style={{ background: c }}
        >
          {value === c && <Icon name="check" size={14} strokeWidth={2.4} />}
        </button>
      ))}
    </div>
  )
}
