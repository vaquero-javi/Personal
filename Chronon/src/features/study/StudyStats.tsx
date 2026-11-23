import { useState } from 'react'
import { addDays, differenceInMinutes, format, parseISO, startOfDay, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { fromInputs } from '../../lib/dates'
import type { PlanBundle } from './api'
import { formatHours, weekdayIndex } from './planner'
import { Stat } from './PlanWizard'

const key = (d: Date) => format(d, 'yyyy-MM-dd')
const WEEKS = 16
const BAR_WEEKS = 8

/** Constancia del plan: días estudiados, rachas y horas, a partir de las sesiones marcadas como hechas. */
export function useStudyStats(bundle: PlanBundle) {
  const { plan, events } = bundle
  const today = startOfDay(new Date())
  const minutesByDay = new Map<string, number>()
  const plannedDays = new Set<string>()
  for (const e of events) {
    if (e.study_kind === 'exam') continue
    const day = key(parseISO(e.start_at))
    plannedDays.add(day)
    if (e.completed && e.end_at) minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + differenceInMinutes(parseISO(e.end_at), parseISO(e.start_at)))
  }
  const studied = (d: string) => (minutesByDay.get(d) ?? 0) > 0
  // Un día cuenta para la constancia si tenía estudio previsto (por plan o por horario).
  const planned = (d: Date) => plannedDays.has(key(d)) || (plan.settings.hoursByWeekday[weekdayIndex(d)] ?? 0) > 0

  const first = startOfDay(fromInputs(plan.settings.startDate))
  let best = 0
  let run = 0
  let due = 0
  let kept = 0
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const k = key(d)
    const isToday = d.getTime() === today.getTime()
    if (studied(k)) {
      run++
      if (planned(d)) {
        kept++
        due++
      }
    } else if (planned(d) && !isToday) {
      run = 0
      due++
    }
    best = Math.max(best, run)
  }
  const total = [...minutesByDay.values()].reduce((s, m) => s + m, 0)
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const thisWeek = [...minutesByDay.entries()].filter(([d]) => fromInputs(d) >= weekStart).reduce((s, [, m]) => s + m, 0)

  return {
    minutesByDay,
    plannedDays,
    daysStudied: [...minutesByDay.values()].filter((m) => m > 0).length,
    currentStreak: run,
    bestStreak: best,
    constancy: due ? Math.round((kept / due) * 100) : null,
    totalMinutes: total,
    thisWeek,
  }
}

export function StudyStats({ bundle }: { bundle: PlanBundle }) {
  const stats = useStudyStats(bundle)
  const color = bundle.plan.color

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Días estudiados" value={String(stats.daysStudied)} />
        <Stat label="Racha actual" value={`${stats.currentStreak} día${stats.currentStreak === 1 ? '' : 's'}`} />
        <Stat label="Mejor racha" value={`${stats.bestStreak} día${stats.bestStreak === 1 ? '' : 's'}`} />
        <Stat label="Constancia" value={stats.constancy === null ? '—' : `${stats.constancy} %`} />
        <Stat label="Horas esta semana" value={formatHours(stats.thisWeek)} />
        <Stat label="Horas en total" value={formatHours(stats.totalMinutes)} />
      </dl>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-500">
        <Icon name="flame" size={14} className="mt-px shrink-0" />
        La racha cuenta los días seguidos con estudio; los días de descanso de tu horario no la cortan. La constancia es el porcentaje de días con estudio previsto en que estudiaste.
      </p>
      <Card title="Días estudiados">
        <Heatmap minutesByDay={stats.minutesByDay} plannedDays={stats.plannedDays} color={color} />
      </Card>
      <Card title="Horas de estudio por semana">
        <WeeklyBars minutesByDay={stats.minutesByDay} color={color} />
      </Card>
    </div>
  )
}

/** Intensidad del día (0 a 4) según las horas estudiadas. */
const level = (m: number) => (m <= 0 ? 0 : m < 60 ? 1 : m < 120 ? 2 : m < 240 ? 3 : 4)
const LEVEL_ALPHA = [0, 0.3, 0.5, 0.75, 1]

function Heatmap({ minutesByDay, plannedDays, color }: { minutesByDay: Map<string, number>; plannedDays: Set<string>; color: string }) {
  const today = startOfDay(new Date())
  const start = addDays(startOfWeek(today, { weekStartsOn: 1 }), -(WEEKS - 1) * 7)
  const [hover, setHover] = useState<string | null>(null)
  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)))
  const hovered = hover ? minutesByDay.get(hover) ?? 0 : 0

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="grid grid-rows-7 gap-[3px] pt-0 text-[10px] leading-none text-ink-400" aria-hidden>
          {['L', '', 'X', '', 'V', '', 'D'].map((d, i) => (
            <span key={i} className="flex h-[13px] items-center sm:h-4">
              {d}
            </span>
          ))}
        </div>
        <div className="grid min-w-0 flex-1 grid-flow-col gap-[3px]" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }} role="grid" aria-label="Días estudiados en las últimas semanas">
          {weeks.map((days, w) => (
            <div key={w} className="grid grid-rows-7 gap-[3px]">
              {days.map((d) => {
                const k = key(d)
                const m = minutesByDay.get(k) ?? 0
                const future = d > today
                const missed = !future && m === 0 && plannedDays.has(k) && d < today
                const lv = level(m)
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={future}
                    onMouseEnter={() => setHover(k)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(k)}
                    onBlur={() => setHover(null)}
                    aria-label={`${format(d, "EEEE d 'de' MMMM", { locale: es })}: ${m ? formatHours(m) : 'sin estudio'}`}
                    className={`relative h-[13px] w-full rounded-[3px] sm:h-4 ${future ? 'opacity-0' : lv ? '' : 'bg-ink-100'} ${missed ? 'ring-1 ring-inset ring-ink-300' : ''} ${hover === k ? 'outline outline-2 outline-ink-900' : ''}`}
                  >
                    {lv > 0 && <span className="absolute inset-0 rounded-[3px]" style={{ background: color, opacity: LEVEL_ALPHA[lv] }} />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
        <span className="min-h-4 tabular-nums" aria-live="polite">
          {hover ? (
            <>
              <span className="first-letter:uppercase">{format(fromInputs(hover), "EEE d MMM", { locale: es })}</span> ·{' '}
              <strong className="font-mono text-ink-900">{hovered ? formatHours(hovered) : 'sin estudio'}</strong>
            </>
          ) : (
            'Pasa por un día para ver lo que estudiaste'
          )}
        </span>
        <span className="flex items-center gap-1" aria-hidden>
          Menos
          {LEVEL_ALPHA.map((a, i) => (
            <span key={i} className={`relative size-3 rounded-[3px] ${i ? '' : 'bg-ink-100'}`}>
              {i > 0 && <span className="absolute inset-0 rounded-[3px]" style={{ background: color, opacity: a }} />}
            </span>
          ))}
          Más
        </span>
      </div>
    </div>
  )
}

function WeeklyBars({ minutesByDay, color }: { minutesByDay: Map<string, number>; color: string }) {
  const thisWeek = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weeks = Array.from({ length: BAR_WEEKS }, (_, i) => addDays(thisWeek, -(BAR_WEEKS - 1 - i) * 7))
  const totals = weeks.map((w) => {
    let m = 0
    for (let d = 0; d < 7; d++) m += minutesByDay.get(key(addDays(w, d))) ?? 0
    return m
  })
  const top = Math.max(60, ...totals)
  const [hover, setHover] = useState<number | null>(null)
  const avg = totals.reduce((s, m) => s + m, 0) / totals.length

  return (
    <div className="space-y-2">
      <p className="min-h-4 text-xs text-ink-500" aria-live="polite">
        {hover !== null ? (
          <>
            Semana del {format(weeks[hover], 'd MMM', { locale: es })} · <strong className="font-mono text-ink-900">{formatHours(totals[hover])}</strong>
          </>
        ) : (
          <>
            Media: <strong className="font-mono text-ink-900">{formatHours(Math.round(avg))}</strong> por semana
          </>
        )}
      </p>
      <div className="flex h-32 items-end gap-2 border-b border-ink-200" role="list">
        {totals.map((m, i) => (
          <div
            key={i}
            role="listitem"
            tabIndex={0}
            aria-label={`Semana del ${format(weeks[i], 'd MMM', { locale: es })}: ${formatHours(m)}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className="flex h-full flex-1 cursor-default items-end justify-center outline-none"
          >
            <span
              className="w-full max-w-8 rounded-t-[4px] transition-opacity duration-150"
              style={{ height: m ? `${Math.max(3, (m / top) * 100)}%` : 0, background: color, opacity: hover === null || hover === i ? 1 : 0.45 }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 text-[10px] text-ink-400" aria-hidden>
        {weeks.map((w, i) => (
          <span key={i} className="flex-1 text-center tabular-nums">
            {i % 2 === BAR_WEEKS % 2 ? '' : format(w, 'd/M')}
          </span>
        ))}
      </div>
    </div>
  )
}
