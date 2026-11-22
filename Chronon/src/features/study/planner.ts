/**
 * Reparto del temario en el calendario con repasos espaciados (curva del olvido de Ebbinghaus).
 *
 * Cada día con horas disponibles:
 *   1. Primero los repasos que tocan (como mucho la mitad del día mientras quede temario nuevo).
 *   2. Con lo que queda, se avanza el tema en curso; al terminarlo se empieza el siguiente.
 * Al terminar un tema se programan sus repasos a 1, 3, 7, 15 y 30 días. Si un repaso no cabe,
 * pasa al día siguiente y los siguientes se cuentan desde el día en que se hizo de verdad.
 * Los últimos días antes del examen se reservan para un repaso general de todo y simulacros.
 */
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { fromInputs } from '../../lib/dates'

/** Días tras aprender un tema en los que toca repasarlo. */
export const REVIEW_INTERVALS = [1, 3, 7, 15, 30]

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export interface PlanSettings {
  /** yyyy-MM-dd */
  startDate: string
  /** HH:mm a la que empieza a estudiar cada día. */
  startTime: string
  /** Horas de estudio por día de la semana, lunes primero. */
  hoursByWeekday: number[]
  /** Días antes del examen dedicados solo a repaso general y simulacros. */
  finalReviewDays: number
  /** Para estimar lo que cuesta cada tema a partir de sus páginas. */
  minutesPerPage: number
}

export interface PlannerTopic {
  id: string
  title: string
  totalMinutes: number
  remainingMinutes: number
  /** yyyy-MM-dd en que se terminó de estudiar, si ya está aprendido. */
  learnedOn: string | null
  reviewsDone: number
}

export type SessionKind = 'study' | 'review' | 'final' | 'mock'

export interface PlannedSession {
  /** yyyy-MM-dd */
  day: string
  kind: SessionKind
  topicId: string | null
  minutes: number
  title: string
}

export interface PlanResult {
  sessions: PlannedSession[]
  /** Último día de temario nuevo. */
  finishStudyDay: string | null
  finalDays: number
  studyDays: number
  availableMinutes: number
  warnings: string[]
}

export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7
const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5)
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')

export function reviewMinutes(totalMinutes: number, n: number) {
  // El primer repaso es el más largo; luego basta con refrescar.
  const share = n === 0 ? 0.2 : n === 1 ? 0.15 : 0.1
  return round5(clamp(totalMinutes * share, 15, 90))
}

const finalReviewMinutes = (totalMinutes: number) => round5(clamp(totalMinutes * 0.15, 20, 90))

export const formatHours = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`
}

interface Options {
  /** Primer día del reparto (por defecto settings.startDate). */
  from?: string
  /** Minutos que quedan hoy, si se recalcula a mitad de día. */
  firstDayMinutes?: number
}

export function buildPlan(topics: PlannerTopic[], settings: PlanSettings, examDate: string, options: Options = {}): PlanResult {
  const start = fromInputs(options.from ?? settings.startDate)
  const exam = fromInputs(examDate)
  const days: { date: Date; key: string; minutes: number }[] = []
  for (let d = start; d < exam; d = addDays(d, 1)) {
    let minutes = Math.round((settings.hoursByWeekday[weekdayIndex(d)] ?? 0) * 60)
    if (days.length === 0 && dayKey(d) === dayKey(start) && options.firstDayMinutes !== undefined)
      minutes = Math.min(minutes, options.firstDayMinutes)
    if (minutes >= 15) days.push({ date: d, key: dayKey(d), minutes })
  }
  const availableMinutes = days.reduce((s, d) => s + d.minutes, 0)
  const base = { finishStudyDay: null, finalDays: 0, studyDays: days.length, availableMinutes }
  if (days.length === 0) return { ...base, sessions: [], warnings: ['No hay ningún día con horas de estudio antes del examen.'] }

  // El repaso final nunca se come más de una cuarta parte de los días.
  const reserve = Math.min(Math.max(0, Math.round(settings.finalReviewDays)), Math.floor(days.length / 4))
  let result = simulate(topics, days, start, reserve)
  const warnings: string[] = []
  if (result.unfinished.length && reserve > 0) {
    result = simulate(topics, days, start, 0)
    warnings.push('No queda hueco para el repaso final: se usan todos los días para terminar el temario.')
  }
  if (result.unfinished.length) {
    const left = result.unfinished.reduce((s, t) => s + t.remainingMinutes, 0)
    warnings.push(
      `No te da tiempo a todo: faltan ${formatHours(left)} de temario (${result.unfinished.map((t) => t.title).join(', ')}). Sube las horas diarias, empieza antes o quita temas.`,
    )
  }
  if (reserve < settings.finalReviewDays && !result.unfinished.length && settings.finalReviewDays > 0)
    warnings.push(`Con tan pocos días el repaso final se queda en ${result.finalDays} día${result.finalDays === 1 ? '' : 's'}.`)

  return { ...base, ...result, sessions: labelStudyParts(result.sessions, topics), warnings }
}

interface Review {
  topic: PlannerTopic
  n: number
  due: number
  learnedAt: number
}

function simulate(input: PlannerTopic[], days: { date: Date; key: string; minutes: number }[], start: Date, reserve: number) {
  const topics = input.map((t) => ({ ...t }))
  const mainDays = days.slice(0, days.length - reserve)
  const finalDays = days.slice(days.length - reserve)
  const sessions: PlannedSession[] = []
  const queue = topics.filter((t) => t.remainingMinutes > 0)
  const reviews: Review[] = []
  let finishStudyDay: string | null = null

  for (const t of topics) {
    if (t.remainingMinutes > 0 || !t.learnedOn || t.reviewsDone >= REVIEW_INTERVALS.length) continue
    const learnedAt = differenceInCalendarDays(fromInputs(t.learnedOn), start)
    reviews.push({ topic: t, n: t.reviewsDone, due: learnedAt + REVIEW_INTERVALS[t.reviewsDone], learnedAt })
  }

  for (const day of mainDays) {
    const idx = differenceInCalendarDays(day.date, start)
    let free = day.minutes
    const reviewBudget = queue.length ? Math.round(day.minutes / 2) : day.minutes
    let reviewed = 0

    const due = reviews.filter((r) => r.due <= idx).sort((a, b) => a.due - b.due || b.n - a.n)
    for (const r of due) {
      const minutes = reviewMinutes(r.topic.totalMinutes, r.n)
      // Siempre cabe al menos un repaso al día aunque pase del presupuesto, para no acumularlos sin fin.
      if (minutes > free || (reviewed > 0 && reviewed + minutes > reviewBudget)) continue
      sessions.push({ day: day.key, kind: 'review', topicId: r.topic.id, minutes, title: `Repaso ${r.n + 1}: ${r.topic.title}` })
      reviewed += minutes
      free -= minutes
      reviews.splice(reviews.indexOf(r), 1)
      if (r.n + 1 < REVIEW_INTERVALS.length)
        reviews.push({ ...r, n: r.n + 1, due: Math.max(r.learnedAt + REVIEW_INTERVALS[r.n + 1], idx + 1) })
    }

    while (free >= 15 && queue.length) {
      const t = queue[0]
      // Si al tema le quedan unos pocos minutos más de lo que cabe, se terminan hoy y no se deja una sesión mínima para mañana.
      const minutes = t.remainingMinutes - free <= 10 ? t.remainingMinutes : free
      const last = sessions.at(-1)
      if (last && last.day === day.key && last.kind === 'study' && last.topicId === t.id) last.minutes += minutes
      else sessions.push({ day: day.key, kind: 'study', topicId: t.id, minutes, title: t.title })
      t.remainingMinutes -= minutes
      free -= minutes
      if (t.remainingMinutes <= 0) {
        queue.shift()
        t.learnedOn = day.key
        finishStudyDay = day.key
        reviews.push({ topic: t, n: 0, due: idx + REVIEW_INTERVALS[0], learnedAt: idx })
      }
    }
  }

  // Repaso final: todos los temas aprendidos repartidos entre los últimos días y, con lo que sobre, simulacros.
  const learned = topics.filter((t) => t.remainingMinutes <= 0)
  finalDays.forEach((day, i) => {
    const group = learned.filter((_, j) => Math.floor((j * finalDays.length) / learned.length) === i)
    const wanted = group.map((t) => finalReviewMinutes(t.totalMinutes))
    const total = wanted.reduce((s, m) => s + m, 0)
    // El repaso deja al menos un 30 % del día para el simulacro.
    const scale = total > day.minutes * 0.7 ? (day.minutes * 0.7) / total : 1
    let free = day.minutes
    group.forEach((t, j) => {
      const minutes = round5(wanted[j] * scale)
      sessions.push({ day: day.key, kind: 'final', topicId: t.id, minutes, title: `Repaso general: ${t.title}` })
      free -= minutes
    })
    if (free >= 30) sessions.push({ day: day.key, kind: 'mock', topicId: null, minutes: Math.min(free, 180), title: 'Simulacro de examen' })
  })

  return { sessions, unfinished: queue, finishStudyDay, finalDays: finalDays.length }
}

/** «Estudiar: Tema 3 (2/4)» cuando un tema ocupa varios días. */
function labelStudyParts(sessions: PlannedSession[], topics: PlannerTopic[]) {
  const parts = new Map<string, number>()
  for (const s of sessions) if (s.kind === 'study' && s.topicId) parts.set(s.topicId, (parts.get(s.topicId) ?? 0) + 1)
  const seen = new Map<string, number>()
  return sessions.map((s) => {
    if (s.kind !== 'study' || !s.topicId) return s
    const total = parts.get(s.topicId)!
    const n = (seen.get(s.topicId) ?? 0) + 1
    seen.set(s.topicId, n)
    const started = topics.find((t) => t.id === s.topicId)
    const resumed = started && started.remainingMinutes < started.totalMinutes
    const suffix = total > 1 ? ` (${n}/${total})` : resumed ? ' (final)' : ''
    return { ...s, title: `Estudiar: ${s.title}${suffix}` }
  })
}

/** Bloque máximo seguido antes de un descanso. */
const MAX_BLOCK = 90
const BREAK = 10

export interface TimedSession extends PlannedSession {
  start: Date
  end: Date
}

/**
 * Pone hora a cada sesión: empiezan a la hora elegida, los repasos primero, en bloques de
 * hasta 90 minutos con 10 de descanso entre medias.
 */
export function scheduleTimes(sessions: PlannedSession[], startTime: string, firstDayStart?: Date): TimedSession[] {
  const order: Record<SessionKind, number> = { review: 0, final: 1, study: 2, mock: 3 }
  const byDay = new Map<string, PlannedSession[]>()
  for (const s of sessions) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s])

  const out: TimedSession[] = []
  for (const [day, list] of byDay) {
    let cursor = fromInputs(day, startTime)
    if (firstDayStart && dayKey(firstDayStart) === day && firstDayStart > cursor) cursor = firstDayStart
    for (const s of [...list].sort((a, b) => order[a.kind] - order[b.kind])) {
      // Los simulacros van del tirón, como el examen.
      const blocks = s.kind === 'mock' ? 1 : Math.ceil(s.minutes / MAX_BLOCK)
      const each = blocks > 1 ? round5(s.minutes / blocks) : s.minutes
      for (let b = 0; b < blocks; b++) {
        const minutes = b === blocks - 1 ? s.minutes - each * (blocks - 1) : each
        const end = new Date(cursor.getTime() + minutes * 60_000)
        out.push({ ...s, minutes, start: cursor, end })
        cursor = new Date(end.getTime() + BREAK * 60_000)
      }
    }
  }
  return out
}
