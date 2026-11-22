import { Field, inputClass } from '../../components/ui'
import { WEEKDAYS, formatHours, type PlanSettings } from './planner'

/** Horario de estudio: qué días, cuántas horas y a qué hora. Lo usan el asistente y «Ajustar horario». */
export function ScheduleFields({
  value,
  onChange,
  showStartDate = true,
}: {
  value: PlanSettings
  onChange: (v: PlanSettings) => void
  showStartDate?: boolean
}) {
  const set = <K extends keyof PlanSettings>(key: K, v: PlanSettings[K]) => onChange({ ...value, [key]: v })
  const weekly = value.hoursByWeekday.reduce((s, h) => s + h, 0)

  function setHours(i: number, hours: number) {
    const next = [...value.hoursByWeekday]
    next[i] = Math.min(14, Math.max(0, Math.round(hours * 2) / 2))
    set('hoursByWeekday', next)
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {showStartDate && (
          <Field label="Empiezo a estudiar el">
            <input type="date" className={inputClass} value={value.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
        )}
        <Field label="Cada día empiezo a las">
          <input type="time" className={inputClass} value={value.startTime} onChange={(e) => set('startTime', e.target.value || '09:00')} />
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium text-ink-600">¿Cuántas horas vas a estudiar cada día?</span>
          <span className="font-mono text-xs tabular-nums text-ink-500">{formatHours(weekly * 60)} / semana</span>
        </div>
        <ul className="divide-y divide-ink-100 rounded-xl ring-1 ring-ink-200">
          {WEEKDAYS.map((day, i) => {
            const h = value.hoursByWeekday[i]
            return (
              <li key={day} className="flex items-center gap-3 px-3 py-2">
                <span className={`flex-1 text-sm ${h ? 'text-ink-900' : 'text-ink-400'}`}>{day}</span>
                <span className="text-xs text-ink-400">{h ? '' : 'Descanso'}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setHours(i, h - 0.5)} className="grid size-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" aria-label={`Menos horas el ${day}`}>
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={14}
                    step={0.5}
                    value={h}
                    onChange={(e) => setHours(i, Number(e.target.value))}
                    className="h-8 w-14 rounded-lg border border-ink-200 bg-surface text-center font-mono text-sm tabular-nums outline-none focus:border-accent-400"
                    aria-label={`Horas el ${day}`}
                  />
                  <button type="button" onClick={() => setHours(i, h + 0.5)} className="grid size-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" aria-label={`Más horas el ${day}`}>
                    +
                  </button>
                  <span className="w-3 text-xs text-ink-400">h</span>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <Field label="Días antes del examen solo para repaso general y simulacros">
        <input
          type="number"
          min={0}
          max={60}
          className={inputClass}
          value={value.finalReviewDays}
          onChange={(e) => set('finalReviewDays', Math.max(0, Math.min(60, Math.round(Number(e.target.value)))))}
        />
      </Field>
    </div>
  )
}
