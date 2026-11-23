import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { addDays, addMinutes, differenceInMinutes, format, isSameDay, parseISO, startOfDay } from 'date-fns'
import { supabase, unwrap } from '../../lib/supabase'
import { fromInputs } from '../../lib/dates'
import type { CalendarEvent, StudyKind } from '../../lib/types'
import {
  REVIEW_INTERVALS,
  buildPlan,
  firstLapMinutes,
  lapMinutes,
  scheduleTimes,
  sessionAlertOffset,
  weekdayIndex,
  type Difficulty,
  type PlanSettings,
  type PlannerTopic,
  type TimedSession,
} from './planner'
import type { ExamQuestion } from '../notes/study'

export interface StudyPlan {
  id: string
  title: string
  exam_date: string
  color: string
  section_id: string | null
  settings: PlanSettings
  created_at: string
}

export interface StudyTopic {
  id: string
  plan_id: string
  note_id: string | null
  title: string
  position: number
  pages: number | null
  /** Lo que dura la 1ª vuelta (ya con la dificultad que tenía al empezar). */
  minutes: number
  /** Estimación a dificultad media; null en planes antiguos (se usa minutes). */
  base_minutes: number | null
  difficulty: Difficulty | null
  /** Carpeta del documento, para enlazarlo. */
  notes: { section_id: string } | null
}

export interface PlanBundle {
  plan: StudyPlan
  topics: StudyTopic[]
  events: CalendarEvent[]
}

export interface TopicDraft {
  title: string
  noteId: string | null
  pages: number | null
  /** Estimación a dificultad media. */
  baseMinutes: number
  difficulty: Difficulty | null
}

export interface StudyMock {
  id: string
  plan_id: string
  title: string
  topic_ids: string[]
  content: { questions: ExamQuestion[] }
  score: number | null
  total: number | null
  created_at: string
}

export const KIND_COLORS: Record<Exclude<StudyKind, 'study'>, string> = {
  review: '#c9962c',
  final: '#8a5a9e',
  mock: '#d45f32',
  exam: '#c4526e',
}

export const KIND_LABEL: Record<StudyKind, string> = {
  study: 'Estudio',
  review: 'Repaso',
  final: 'Repaso general',
  mock: 'Simulacro',
  exam: 'Examen',
}

export function usePlans() {
  return useQuery({
    queryKey: ['plans', 'list'],
    queryFn: async () => unwrap(await supabase.from('study_plans').select('*').order('exam_date')) as StudyPlan[],
  })
}

async function fetchPlanBundle(id: string): Promise<PlanBundle> {
  const [plan, topics, events] = await Promise.all([
    supabase.from('study_plans').select('*').eq('id', id).single(),
    supabase.from('study_topics').select('*, notes(section_id)').eq('plan_id', id).order('position'),
    supabase.from('events').select('*').eq('study_plan_id', id).order('start_at'),
  ])
  return {
    plan: unwrap(plan) as StudyPlan,
    topics: unwrap(topics) as StudyTopic[],
    events: unwrap(events) as CalendarEvent[],
  }
}

export function usePlan(id: string | undefined) {
  return useQuery({
    queryKey: ['plans', 'one', id],
    enabled: !!id,
    queryFn: () => fetchPlanBundle(id!),
  })
}

/** Documentos con PDF de todas las carpetas, para elegir temas que ya están subidos. */
export function usePdfDocuments() {
  return useQuery({
    queryKey: ['notes', 'pdfs'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('notes')
          .select('id, title, section_id, pages:drawing->pdf->sheets')
          .not('drawing->pdf', 'is', null)
          .order('title'),
      ) as { id: string; title: string; section_id: string; pages: unknown[] | null }[],
  })
}

const durationOf = (e: CalendarEvent) => (e.end_at ? differenceInMinutes(parseISO(e.end_at), parseISO(e.start_at)) : 0)

/** Estado de cada tema según las sesiones marcadas como hechas. */
export function topicProgress(topics: StudyTopic[], events: CalendarEvent[]): PlannerTopic[] {
  return topics.map((t) => {
    const mine = events.filter((e) => e.study_topic_id === t.id && e.completed)
    const studied = mine.filter((e) => e.study_kind === 'study')
    const base = {
      id: t.id,
      title: t.title,
      totalMinutes: t.minutes,
      baseMinutes: t.base_minutes ?? t.minutes,
      difficulty: t.difficulty,
      pages: t.pages,
      reviewsDone: Math.min(mine.filter((e) => e.study_kind === 'review').length, REVIEW_INTERVALS.length),
    }
    // Minutos hechos en cada vuelta. Las sesiones de antes de que hubiera vueltas no la llevan:
    // llenan la 1ª vuelta y lo que sobre pasa a las siguientes.
    const lapDone: number[] = []
    let loose = 0
    for (const e of studied) {
      if (e.study_lap) lapDone[e.study_lap - 1] = (lapDone[e.study_lap - 1] ?? 0) + durationOf(e)
      else loose += durationOf(e)
    }
    for (let lap = 1; loose > 0; lap++) {
      const room = Math.max(0, lapMinutes(base, lap) - (lapDone[lap - 1] ?? 0))
      const put = lap > 50 ? loose : Math.min(room, loose)
      lapDone[lap - 1] = (lapDone[lap - 1] ?? 0) + put
      loose -= put
    }
    for (let i = 0; i < lapDone.length; i++) lapDone[i] ??= 0
    const firstDone = lapDone[0] ?? 0
    // Unos minutos sueltos no merecen otra sesión: el tema se da por estudiado. También si ya va por otra vuelta.
    const remaining = t.minutes - firstDone < 10 || lapDone.slice(1).some((m) => m > 0) ? 0 : t.minutes - firstDone
    const firstLapSessions = studied.filter((e) => (e.study_lap ?? 1) === 1)
    const lastStudy = (firstLapSessions.length ? firstLapSessions : studied).map((e) => e.start_at).sort().at(-1)
    return {
      ...base,
      remainingMinutes: remaining,
      learnedOn: remaining === 0 && lastStudy ? format(parseISO(lastStudy), 'yyyy-MM-dd') : null,
      studiedMinutes: studied.reduce((sum, e) => sum + durationOf(e), 0),
      lapDone,
    }
  })
}

function eventRows(plan: Pick<StudyPlan, 'id' | 'title' | 'color'>, sessions: TimedSession[]) {
  return sessions.map((s) => ({
    title: s.title,
    description: `Plan de estudio: ${plan.title}`,
    type: 'event' as const,
    start_at: s.start.toISOString(),
    end_at: s.end.toISOString(),
    all_day: false,
    color: s.kind === 'study' ? plan.color : KIND_COLORS[s.kind],
    completed: false,
    study_plan_id: plan.id,
    study_topic_id: s.topicId,
    study_kind: s.kind,
    study_lap: s.kind === 'study' ? (s.lap ?? 1) : null,
  }))
}

/**
 * Guarda las sesiones en el calendario, cada una con su aviso push (si el plan los quiere).
 * Los avisos cuyo momento ya ha pasado se crean descartados y no suenan.
 */
async function insertInChunks(rows: object[], settings: PlanSettings) {
  const offset = sessionAlertOffset(settings)
  for (let i = 0; i < rows.length; i += 400) {
    const ids = unwrap(await supabase.from('events').insert(rows.slice(i, i + 400)).select('id')) as { id: string }[]
    if (offset !== null && ids.length)
      unwrap(await supabase.from('event_alerts').insert(ids.map((e) => ({ event_id: e.id, offset_minutes: offset }))))
  }
}

function useInvalidatePlans() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['plans'] })
    qc.invalidateQueries({ queryKey: ['events'] })
    qc.invalidateQueries({ queryKey: ['alerts'] })
  }
}

export function useCreatePlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: async (input: {
      title: string
      examDate: string
      color: string
      sectionId: string | null
      settings: PlanSettings
      topics: TopicDraft[]
    }) => {
      const plan = unwrap(
        await supabase
          .from('study_plans')
          .insert({ title: input.title, exam_date: input.examDate, color: input.color, section_id: input.sectionId, settings: input.settings })
          .select()
          .single(),
      ) as StudyPlan
      try {
        const topics = unwrap(
          await supabase
            .from('study_topics')
            .insert(
              input.topics.map((t, position) => ({
                plan_id: plan.id,
                note_id: t.noteId,
                title: t.title,
                pages: t.pages,
                base_minutes: t.baseMinutes,
                difficulty: t.difficulty,
                minutes: firstLapMinutes(t.baseMinutes, t.difficulty),
                position,
              })),
            )
            .select(),
        ) as StudyTopic[]
        topics.sort((a, b) => a.position - b.position)
        const result = buildPlan(topicProgress(topics, []), input.settings, input.examDate)
        await insertInChunks(eventRows(plan, scheduleTimes(result.sessions, input.settings.startTime)), input.settings)

        // El día del examen, con aviso la víspera.
        const exam = unwrap(
          await supabase
            .from('events')
            .insert({
              title: `Examen: ${plan.title}`,
              type: 'event',
              start_at: fromInputs(input.examDate).toISOString(),
              all_day: true,
              color: KIND_COLORS.exam,
              study_plan_id: plan.id,
              study_kind: 'exam',
            })
            .select('id')
            .single(),
        ) as { id: string }
        unwrap(await supabase.from('event_alerts').insert({ event_id: exam.id, offset_minutes: 1440 }))
        return plan
      } catch (err) {
        await supabase.from('study_plans').delete().eq('id', plan.id)
        throw err
      }
    },
    onSuccess: invalidate,
  })
}

const ROUND = 15

/**
 * Rehace el calendario desde ahora con lo que de verdad se ha hecho.
 * - Lo que ya pasó (o ya ha empezado) no se borra nunca: así se puede marcar más tarde si se hizo.
 * - Las sesiones pendientes de días anteriores cuentan como no hechas y se vuelven a repartir.
 * - Las de hoy que ya han empezado se respetan y cuentan como hechas, por si se están haciendo.
 * - Todo lo pendiente desde ahora se borra y se reparte de nuevo.
 */
async function replanBundle(bundle: PlanBundle, settings?: PlanSettings) {
  const { plan, topics } = bundle
  const s = settings ?? plan.settings
  if (settings) unwrap(await supabase.from('study_plans').update({ settings }).eq('id', plan.id))

  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const sessionsToday = bundle.events.filter((e) => e.study_kind !== 'exam' && isSameDay(parseISO(e.start_at), now))
  const keptToday = sessionsToday.filter((e) => e.completed || parseISO(e.start_at) < now)
  const keptIds = new Set(keptToday.map((e) => e.id))
  const events = bundle.events.map((e) => (keptIds.has(e.id) && !e.completed ? { ...e, completed: true } : e))

  // Hoy se sigue después de lo que ya se ha hecho o empezado, con las horas que queden.
  const lastEnd = keptToday.map((e) => parseISO(e.end_at ?? e.start_at)).sort((x, y) => y.getTime() - x.getTime())[0]
  const rounded = addMinutes(now, ROUND - (now.getMinutes() % ROUND))
  let firstDayStart = fromInputs(today, s.startTime)
  if (rounded > firstDayStart) firstDayStart = rounded
  if (lastEnd && addMinutes(lastEnd, 10) > firstDayStart) firstDayStart = addMinutes(lastEnd, 10)
  const usedToday = keptToday.reduce((m, e) => m + durationOf(e), 0)
  const untilNight = differenceInMinutes(fromInputs(today, '23:00'), firstDayStart)
  const firstDayMinutes = Math.max(0, Math.min(s.hoursByWeekday[weekdayIndex(now)] * 60 - usedToday, untilNight))

  const from = today > s.startDate ? today : s.startDate
  const result = buildPlan(topicProgress(topics, events), s, plan.exam_date, {
    from,
    firstDayMinutes: from === today ? firstDayMinutes : undefined,
  })
  unwrap(
    await supabase
      .from('events')
      .delete()
      .eq('study_plan_id', plan.id)
      .eq('completed', false)
      .neq('study_kind', 'exam')
      .gte('start_at', now.toISOString()),
  )
  await insertInChunks(eventRows(plan, scheduleTimes(result.sessions, s.startTime, from === today ? firstDayStart : undefined)), s)
  return result
}

export function useReplan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: ({ bundle, settings }: { bundle: PlanBundle; settings?: PlanSettings }) => replanBundle(bundle, settings),
    onSuccess: invalidate,
  })
}

/**
 * Marca o desmarca una sesión. Si es de un día anterior, ya se había pasado a otro día:
 * el plan se reajusta solo para quitar (o volver a poner) lo que toque.
 */
export function useToggleSession(planId: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: async (e: CalendarEvent) => {
      unwrap(await supabase.from('events').update({ completed: !e.completed }).eq('id', e.id))
      if (parseISO(e.start_at) < startOfDay(new Date())) await replanBundle(await fetchPlanBundle(planId))
    },
    onMutate: (e) => {
      // Se marca al momento en la pantalla y se guarda por detrás.
      qc.setQueryData<PlanBundle>(['plans', 'one', planId], (prev) =>
        prev ? { ...prev, events: prev.events.map((x) => (x.id === e.id ? { ...x, completed: !e.completed } : x)) } : prev,
      )
    },
    onSettled: invalidate,
  })
}

/**
 * Lo que no se marcó como hecho en días anteriores pasa solo al siguiente hueco de estudio
 * (hoy si todavía no se ha empezado; si no, después de lo de hoy o mañana). Las sesiones
 * originales se quedan en su día para poder marcarlas si se hicieron.
 * Cada plan guarda hasta qué día se ha hecho esto (settings.rolledUntil) para no repetirlo.
 * Se comprueba al abrir la app, al volver a ella y cada media hora.
 */
export function useStudyRollover() {
  const invalidate = useInvalidatePlans()
  useEffect(() => {
    let lastRun = ''
    let running = false

    async function run() {
      const now = new Date()
      const today = format(now, 'yyyy-MM-dd')
      if (running || lastRun === today || document.visibilityState === 'hidden') return
      running = true
      try {
        const todayStart = startOfDay(now)
        const [pending, plans] = await Promise.all([
          supabase
            .from('events')
            .select('study_plan_id, start_at')
            .not('study_plan_id', 'is', null)
            .eq('completed', false)
            .neq('study_kind', 'exam')
            .gte('start_at', addDays(todayStart, -60).toISOString())
            .lt('start_at', todayStart.toISOString()),
          supabase.from('study_plans').select('id, exam_date, settings').gt('exam_date', today),
        ])
        const rows = unwrap(pending) as { study_plan_id: string; start_at: string }[]
        let changed = false
        for (const p of unwrap(plans) as Pick<StudyPlan, 'id' | 'exam_date' | 'settings'>[]) {
          const since = p.settings.rolledUntil ?? '0000-00-00'
          const overdue = rows.some((r) => r.study_plan_id === p.id && format(parseISO(r.start_at), 'yyyy-MM-dd') >= since)
          if (!overdue) continue
          const bundle = await fetchPlanBundle(p.id)
          await replanBundle(bundle)
          unwrap(await supabase.from('study_plans').update({ settings: { ...bundle.plan.settings, rolledUntil: today } }).eq('id', p.id))
          changed = true
        }
        lastRun = today
        if (changed) invalidate()
      } catch (err) {
        console.warn('No se han podido pasar las sesiones atrasadas', err)
      } finally {
        running = false
      }
    }

    run()
    document.addEventListener('visibilitychange', run)
    const timer = setInterval(run, 30 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', run)
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export function useDeletePlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    // Las sesiones del calendario se borran en cascada; los PDFs se quedan en Documentos.
    mutationFn: async (id: string) => unwrap(await supabase.from('study_plans').delete().eq('id', id)),
    onSuccess: invalidate,
  })
}

/**
 * Semáforo: cambia la dificultad de un tema y recalcula el plan desde hoy.
 * Si todavía no se ha empezado, también cambia lo que dura su 1ª vuelta.
 */
export function useSetDifficulty(planId: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: async ({ topic, difficulty }: { topic: StudyTopic; difficulty: Difficulty }) => {
      const bundle = await fetchPlanBundle(planId)
      const started = bundle.events.some((e) => e.study_topic_id === topic.id && e.study_kind === 'study' && e.completed)
      const base = topic.base_minutes ?? topic.minutes
      unwrap(
        await supabase
          .from('study_topics')
          .update({ difficulty, base_minutes: base, ...(started ? {} : { minutes: firstLapMinutes(base, difficulty) }) })
          .eq('id', topic.id),
      )
      return replanBundle(await fetchPlanBundle(planId))
    },
    onMutate: ({ topic, difficulty }) => {
      qc.setQueryData<PlanBundle>(['plans', 'one', planId], (prev) =>
        prev ? { ...prev, topics: prev.topics.map((t) => (t.id === topic.id ? { ...t, difficulty } : t)) } : prev,
      )
    },
    onSettled: invalidate,
  })
}

export function useMocks(planId: string) {
  return useQuery({
    queryKey: ['plans', 'mocks', planId],
    queryFn: async () =>
      unwrap(await supabase.from('study_mocks').select('*').eq('plan_id', planId).order('created_at', { ascending: false })) as StudyMock[],
  })
}

export function useSaveMock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (mock: Pick<StudyMock, 'plan_id' | 'title' | 'topic_ids' | 'content'>) =>
      unwrap(await supabase.from('study_mocks').insert(mock).select().single()) as StudyMock,
    onSuccess: (m) => qc.invalidateQueries({ queryKey: ['plans', 'mocks', m.plan_id] }),
  })
}

export function useScoreMock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ mock, score, total }: { mock: StudyMock; score: number; total: number }) =>
      unwrap(await supabase.from('study_mocks').update({ score, total }).eq('id', mock.id).select().single()) as StudyMock,
    onSuccess: (m) => qc.invalidateQueries({ queryKey: ['plans', 'mocks', m.plan_id] }),
  })
}

export function useDeleteMock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (mock: StudyMock) => unwrap(await supabase.from('study_mocks').delete().eq('id', mock.id)),
    onSuccess: (_d, m) => qc.invalidateQueries({ queryKey: ['plans', 'mocks', m.plan_id] }),
  })
}
