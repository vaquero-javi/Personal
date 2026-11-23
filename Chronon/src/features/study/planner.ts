/**
 * Reparto del temario en el calendario por vueltas, con repasos espaciados (curva del olvido de Ebbinghaus).
 *
 * Cada día con horas disponibles:
 *   1. Primero los repasos que tocan (como mucho la mitad del día mientras quede temario).
 *   2. Con lo que queda, se avanza el tema en curso; al terminarlo se empieza el siguiente.
 * Al terminar un tema por primera vez se programan sus repasos (a 1, 3, 7, 15 y 30 días si es de dificultad
 * media; más y más seguidos si es difícil, menos si es fácil). Si un repaso
 * no cabe, pasa al día siguiente y los siguientes se cuentan desde el día en que se hizo de verdad.
 * Al terminar el temario se vuelve a empezar desde el primer tema (2ª vuelta, 3ª vuelta…), cada vuelta
 * más rápida que la anterior, hasta llegar a los días de repaso final o al examen.
 * La dificultad de cada tema (fácil, media, difícil) no cambia sus horas, sino la atención que recibe:
 * los difíciles se repasan más veces, entran en todas las vueltas y van primero; los fáciles se repasan
 * menos y, a partir de la 2ª vuelta, se estudian una vuelta sí y otra no.
 * Los últimos días antes del examen se reservan para un repaso general de todo y simulacros.
 */
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { fromInputs } from '../../lib/dates'

/** Días tras aprender un tema (de dificultad media) en los que toca repasarlo. */
export const REVIEW_INTERVALS = [1, 3, 7, 15, 30]

/** Repasos según la dificultad: los difíciles, más y más seguidos; los fáciles, menos. */
const REVIEWS_BY_DIFFICULTY: Record<Difficulty, number[]> = {
  easy: [1, 7, 30],
  medium: REVIEW_INTERVALS,
  hard: [1, 2, 4, 7, 12, 20, 30],
}

export const reviewIntervals = (d: Difficulty | null) => REVIEWS_BY_DIFFICULTY[d ?? 'medium']

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export type Difficulty = 'easy' | 'medium' | 'hard'

/** Orden dentro de cada vuelta (a partir de la 2ª) y entre repasos del mismo día: primero lo que peor llevas. */
const PRIORITY: Record<Difficulty, number> = { hard: 0, medium: 1, easy: 2 }
const priorityOf = (d: Difficulty | null) => PRIORITY[d ?? 'medium']

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Fácil', medium: 'Media', hard: 'Difícil' }

/** Colores del semáforo. */
export const DIFFICULTY_COLOR: Record<Difficulty, string> = { easy: '#4f8a67', medium: '#c9962c', hard: '#c4526e' }

/** Parte del tiempo de la 1ª vuelta que lleva cada vuelta: cada una más rápida que la anterior. */
export const LAP_SPEED = [1, 0.6, 0.4, 0.3, 0.25, 0.2]

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
  /** yyyy-MM-dd del último día en que se pasó lo atrasado al siguiente día. */
  rolledUntil?: string
  /**
   * Aviso push de cada sesión: minutos antes de empezar (0 = al empezar). null = sin avisos.
   * Los planes de antes de que hubiera avisos no lo tienen: cuentan como 0.
   */
  notifyOffset?: number | null
}

/** Antelación de los avisos de las sesiones de un plan, o null si no quiere avisos. */
export const sessionAlertOffset = (s: PlanSettings) => (s.notifyOffset === undefined ? 0 : s.notifyOffset)

export interface PlannerTopic {
  id: string
  title: string
  /** Lo que dura la 1ª vuelta. */
  totalMinutes: number
  /** Lo que le queda a la 1ª vuelta (0 si ya está aprendido). */
  remainingMinutes: number
  /** yyyy-MM-dd en que se terminó de estudiar por primera vez, si ya está aprendido. */
  learnedOn: string | null
  reviewsDone: number
  /** Minutos de estudio hechos en total, contando todas las vueltas. */
  studiedMinutes: number
  /** Minutos hechos en cada vuelta: [1ª, 2ª, …]. */
  lapDone: number[]
  /** Estimación a dificultad media, de la que salen las vueltas siguientes. */
  baseMinutes: number
  difficulty: Difficulty | null
  /** Páginas del PDF, para decir qué parte toca en cada sesión. */
  pages: number | null
}

export type SessionKind = 'study' | 'review' | 'final' | 'mock'

export interface PlannedSession {
  /** yyyy-MM-dd */
  day: string
  kind: SessionKind
  topicId: string | null
  minutes: number
  title: string
  /** Vuelta al temario de una sesión de estudio. */
  lap?: number
  /** Parte de la vuelta que cubre la sesión, de 0 a 1. */
  from?: number
  to?: number
}

export interface PlanResult {
  sessions: PlannedSession[]
  /** Último día de la 1ª vuelta al temario. */
  finishStudyDay: string | null
  /** Vueltas al temario que se empiezan antes del examen (contando la que está en curso). */
  laps: number
  finalDays: number
  studyDays: number
  availableMinutes: number
  warnings: string[]
}

export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7
const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5)
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')

/** Lo que dura la 1ª vuelta de un tema: lo que se ha estimado, sea cual sea su dificultad. */
export const firstLapMinutes = (baseMinutes: number) => Math.max(15, round5(baseMinutes))

/** Los temas fáciles se saltan las vueltas pares (2ª, 4ª…) para dejar más sitio a los que cuestan. */
const skipsLap = (d: Difficulty | null, lap: number) => d === 'easy' && lap > 1 && lap % 2 === 0

/** Lo que dura una vuelta de un tema (0 si se la salta por ser fácil). La 1ª queda fija al empezarla. */
export function lapMinutes(t: Pick<PlannerTopic, 'totalMinutes' | 'baseMinutes' | 'difficulty'>, lap: number) {
  if (lap <= 1) return t.totalMinutes
  if (skipsLap(t.difficulty, lap)) return 0
  const speed = LAP_SPEED[Math.min(lap, LAP_SPEED.length) - 1]
  return Math.max(15, round5(t.baseMinutes * speed))
}

/** Vuelta en la que va el tema (1 = primera vez), lo que le queda para terminarla y lo que lleva hecho de ella. */
export function lapState(t: PlannerTopic) {
  if (t.totalMinutes <= 0) return { lap: 1, remaining: 0, length: 0, progress: 1 }
  let lap = 1
  for (;;) {
    const length = lapMinutes(t, lap)
    const done = t.lapDone[lap - 1] ?? 0
    // Una vuelta está cerrada si se ha hecho (salvo unos minutos sueltos), si se la salta
    // o si ya se ha empezado otra después.
    const closed = length === 0 || done > length - 10 || t.lapDone.slice(lap).some((m) => m > 0)
    if (!closed) return { lap, remaining: length - done, length, progress: done / length }
    lap++
  }
}

/** «2ª vuelta» */
export const lapLabel = (lap: number) => `${lap}ª vuelta`

export function reviewMinutes(t: Pick<PlannerTopic, 'totalMinutes'>, n: number) {
  // El primer repaso es el más largo; luego basta con refrescar.
  const share = n === 0 ? 0.2 : n === 1 ? 0.15 : 0.1
  return round5(clamp(t.totalMinutes * share, 15, 90))
}

const finalReviewMinutes = (t: PlannerTopic) => round5(clamp(t.totalMinutes * 0.15, 20, 90))

export const formatHours = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`
}

/** «págs. 11–20» de la parte de un PDF que va de `from` a `to` (0 a 1). */
export function pageRange(pages: number | null | undefined, from = 0, to = 1) {
  if (!pages) return null
  // Redondeando igual el principio y el final, las partes seguidas no repiten página.
  const first = Math.min(pages, Math.round(from * pages) + 1)
  const last = Math.max(first, Math.min(pages, Math.round(to * pages)))
  return first === last ? `pág. ${first}` : `págs. ${first}–${last}`
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
  const base = { finishStudyDay: null, laps: 0, finalDays: 0, studyDays: days.length, availableMinutes }
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
    const left = result.unfinished.reduce((s, t) => s + t.remaining, 0)
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
  const topics = input.map((t) => {
    const { lap, remaining, length } = lapState(t)
    return { ...t, lap, lapRemaining: remaining, lapLength: length }
  })
  const mainDays = days.slice(0, days.length - reserve)
  const finalDays = days.slice(days.length - reserve)
  const sessions: PlannedSession[] = []
  const studiable = topics.filter((t) => t.totalMinutes > 0)
  let lap = Math.min(...studiable.map((t) => t.lap), 1)
  // La 1ª vuelta sigue el orden elegido; en las siguientes van primero los difíciles (sort es estable).
  const lapQueue = () =>
    studiable.filter((t) => t.lap === lap).sort((a, b) => (lap > 1 ? priorityOf(a.difficulty) - priorityOf(b.difficulty) : 0))
  let queue = lapQueue()
  const reviews: Review[] = []
  let finishStudyDay: string | null = null
  // Vuelta más alta ya empezada (la que está a medias cuenta).
  let lastLap = Math.max(0, ...studiable.map((t) => (t.lapRemaining < t.lapLength ? t.lap : t.lap - 1)))

  for (const t of topics) {
    const intervals = reviewIntervals(t.difficulty)
    if (t.remainingMinutes > 0 || !t.learnedOn || t.reviewsDone >= intervals.length) continue
    const learnedAt = differenceInCalendarDays(fromInputs(t.learnedOn), start)
    reviews.push({ topic: t, n: t.reviewsDone, due: learnedAt + intervals[t.reviewsDone], learnedAt })
  }

  for (const day of mainDays) {
    const idx = differenceInCalendarDays(day.date, start)
    let free = day.minutes
    const reviewBudget = queue.length || lap > 1 ? Math.round(day.minutes / 2) : day.minutes
    let reviewed = 0

    const due = reviews
      .filter((r) => r.due <= idx)
      .sort((a, b) => a.due - b.due || priorityOf(a.topic.difficulty) - priorityOf(b.topic.difficulty) || b.n - a.n)
    for (const r of due) {
      const minutes = reviewMinutes(r.topic, r.n)
      // Siempre cabe al menos un repaso al día aunque pase del presupuesto, para no acumularlos sin fin.
      if (minutes > free || (reviewed > 0 && reviewed + minutes > reviewBudget)) continue
      sessions.push({ day: day.key, kind: 'review', topicId: r.topic.id, minutes, title: `Repaso ${r.n + 1}: ${r.topic.title}` })
      reviewed += minutes
      free -= minutes
      reviews.splice(reviews.indexOf(r), 1)
      const intervals = reviewIntervals(r.topic.difficulty)
      if (r.n + 1 < intervals.length) reviews.push({ ...r, n: r.n + 1, due: Math.max(r.learnedAt + intervals[r.n + 1], idx + 1) })
    }

    while (free >= 15 && studiable.length) {
      // Terminada una vuelta al temario, se empieza la siguiente desde el primer tema.
      while (!queue.length) {
        lap++
        queue = lapQueue()
      }
      const t = queue[0]
      // Si al tema le quedan unos pocos minutos más de lo que cabe, se terminan hoy y no se deja una sesión mínima para mañana.
      const minutes = t.lapRemaining - free <= 10 ? t.lapRemaining : free
      const from = (t.lapLength - t.lapRemaining) / t.lapLength
      const to = Math.min(1, (t.lapLength - t.lapRemaining + minutes) / t.lapLength)
      const last = sessions.at(-1)
      if (last && last.day === day.key && last.kind === 'study' && last.topicId === t.id && last.lap === t.lap) {
        last.minutes += minutes
        last.to = to
      } else sessions.push({ day: day.key, kind: 'study', topicId: t.id, minutes, title: t.title, lap: t.lap, from, to })
      lastLap = Math.max(lastLap, t.lap)
      t.lapRemaining -= minutes
      if (t.lap === 1) t.remainingMinutes -= minutes
      free -= minutes
      if (t.lapRemaining <= 0) {
        queue.shift()
        // Los repasos espaciados se programan al aprenderlo la primera vez; las vueltas siguientes ya son repaso.
        if (t.lap === 1) {
          t.remainingMinutes = 0
          t.learnedOn = day.key
          finishStudyDay = day.key
          reviews.push({ topic: t, n: 0, due: idx + reviewIntervals(t.difficulty)[0], learnedAt: idx })
        }
        t.lap++
        while (lapMinutes(t, t.lap) === 0) t.lap++
        t.lapLength = lapMinutes(t, t.lap)
        t.lapRemaining = t.lapLength
      }
    }
  }

  // Repaso final: todos los temas aprendidos repartidos entre los últimos días y, con lo que sobre, simulacros.
  const learned = topics.filter((t) => t.lap > 1)
  finalDays.forEach((day, i) => {
    const group = learned.filter((_, j) => Math.floor((j * finalDays.length) / learned.length) === i)
    const wanted = group.map(finalReviewMinutes)
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

  const unfinished = studiable.filter((t) => t.lap === 1).map((t) => ({ title: t.title, remaining: t.lapRemaining }))
  return { sessions, unfinished, finishStudyDay, laps: lastLap, finalDays: finalDays.length }
}

/**
 * «Estudiar: Tema 3 (2/4) · págs. 11–20» cuando un tema ocupa varios días;
 * «Estudiar (2ª vuelta): …» al repetir el temario.
 */
function labelStudyParts(sessions: PlannedSession[], topics: PlannerTopic[]) {
  const keyOf = (s: PlannedSession) => `${s.topicId}:${s.lap ?? 1}`
  const parts = new Map<string, number>()
  for (const s of sessions) if (s.kind === 'study' && s.topicId) parts.set(keyOf(s), (parts.get(keyOf(s)) ?? 0) + 1)
  const seen = new Map<string, number>()
  return sessions.map((s) => {
    if (s.kind !== 'study' || !s.topicId) return s
    const key = keyOf(s)
    const total = parts.get(key)!
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    const topic = topics.find((t) => t.id === s.topicId)
    const lap = s.lap ?? 1
    const whole = (s.from ?? 0) <= 0 && (s.to ?? 1) >= 1
    const suffix = total > 1 ? ` (${n}/${total})` : (s.from ?? 0) > 0 ? ' (final)' : ''
    const pages = whole ? null : pageRange(topic?.pages, s.from, s.to)
    const prefix = lap > 1 ? `Estudiar (${lapLabel(lap)})` : 'Estudiar'
    return { ...s, title: `${prefix}: ${s.title}${suffix}${pages ? ` · ${pages}` : ''}` }
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
