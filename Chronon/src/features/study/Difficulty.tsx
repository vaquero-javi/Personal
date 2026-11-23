import { DIFFICULTY_COLOR, DIFFICULTY_LABEL, type Difficulty } from './planner'

const LEVELS: Difficulty[] = ['easy', 'medium', 'hard']

/** Semáforo de un tema: fácil (verde), media (ámbar) o difícil (rojo). */
export function DifficultyPicker({
  value,
  onChange,
  size = 'md',
  disabled = false,
}: {
  value: Difficulty | null
  onChange: (d: Difficulty) => void
  size?: 'sm' | 'md'
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Dificultad">
      {LEVELS.map((d) => {
        const on = value === d
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(d)}
            className={`inline-flex items-center gap-1.5 rounded-full font-medium transition-colors duration-150 disabled:opacity-50 ${
              size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-8 px-3 text-xs'
            } ${on ? 'text-white' : 'text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-100'}`}
            style={on ? { background: DIFFICULTY_COLOR[d] } : undefined}
          >
            {!on && <span className="size-2 rounded-full" style={{ background: DIFFICULTY_COLOR[d] }} />}
            {DIFFICULTY_LABEL[d]}
          </button>
        )
      })}
    </div>
  )
}

/** Punto del semáforo; gris si el tema aún no tiene dificultad. */
export function DifficultyDot({ value, className = '' }: { value: Difficulty | null; className?: string }) {
  return (
    <span
      className={`inline-block size-2.5 shrink-0 rounded-full ${value ? '' : 'ring-1 ring-inset ring-ink-300'} ${className}`}
      style={value ? { background: DIFFICULTY_COLOR[value] } : undefined}
      title={value ? DIFFICULTY_LABEL[value] : 'Sin dificultad'}
    />
  )
}
