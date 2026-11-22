import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addMinutes, differenceInMinutes, format, isSameDay, parseISO } from 'date-fns'
import { supabase, unwrap } from '../../lib/supabase'
import { fromInputs } from '../../lib/dates'
import type { CalendarEvent, StudyKind } from '../../lib/types'
import { REVIEW_INTERVALS, buildPlan, scheduleTimes, weekdayIndex, type PlanSettings, type PlannerTopic, type TimedSession } from './planner'

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
  minutes: number
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
  minutes: number
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

export function usePlan(id: string | undefined) {
  return useQuery({
    queryKey: ['plans', 'one', id],
    enabled: !!id,
    queryFn: async (): Promise<PlanBundle> => {
      const [plan, topics, events] = await Promise.all([
        supabase.from('study_plans').select('*').eq('id', id!).single(),
        supabase.from('study_topics').select('*, notes(section_id)').eq('plan_id', id!).order('position'),
        supabase.from('events').select('*').eq('study_plan_id', id!).order('start_at'),
      ])
      return {
        plan: unwrap(plan) as StudyPlan,
        topics: unwrap(topics) as StudyTopic[],
        events: unwrap(events) as CalendarEvent[],
      }
    },
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
    const doneMinutes = studied.reduce((s, e) => s + durationOf(e), 0)
    // Unos minutos sueltos no merecen otra sesión: el tema se da por estudiado.
    const remaining = t.minutes - doneMinutes < 10 ? 0 : t.minutes - doneMinutes
    const lastStudy = studied.map((e) => e.start_at).sort().at(-1)
    return {
      id: t.id,
      title: t.title,
      totalMinutes: t.minutes,
      remainingMinutes: remaining,
      learnedOn: remaining === 0 && lastStudy ? format(parseISO(lastStudy), 'yyyy-MM-dd') : null,
      reviewsDone: Math.min(mine.filter((e) => e.study_kind === 'review').length, REVIEW_INTERVALS.length),
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
  }))
}

async function insertInChunks(rows: object[]) {
  for (let i = 0; i < rows.length; i += 400) unwrap(await supabase.from('events').insert(rows.slice(i, i + 400)))
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
            .insert(input.topics.map((t, position) => ({ plan_id: plan.id, note_id: t.noteId, title: t.title, pages: t.pages, minutes: t.minutes, position })))
            .select(),
        ) as StudyTopic[]
        topics.sort((a, b) => a.position - b.position)
        const result = buildPlan(topicProgress(topics, []), input.settings, input.examDate)
        await insertInChunks(eventRows(plan, scheduleTimes(result.sessions, input.settings.startTime)))

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

/**
 * Rehace el calendario desde hoy con lo que de verdad se ha hecho: las sesiones marcadas como
 * hechas se quedan y todo lo pendiente (también lo atrasado) se vuelve a repartir.
 */
export function useReplan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: async ({ bundle, settings }: { bundle: PlanBundle; settings?: PlanSettings }) => {
      const { plan, topics, events } = bundle
      const s = settings ?? plan.settings
      if (settings) unwrap(await supabase.from('study_plans').update({ settings }).eq('id', plan.id))

      const now = new Date()
      const today = format(now, 'yyyy-MM-dd')
      const doneToday = events.filter((e) => e.completed && e.study_kind !== 'exam' && isSameDay(parseISO(e.start_at), now)).reduce((m, e) => m + durationOf(e), 0)
      const dayStart = fromInputs(today, s.startTime)
      const firstDayStart = now > dayStart ? addMinutes(now, 15 - (now.getMinutes() % 15)) : dayStart
      const untilNight = differenceInMinutes(fromInputs(today, '23:00'), firstDayStart)
      const firstDayMinutes = Math.max(0, Math.min(s.hoursByWeekday[weekdayIndex(now)] * 60 - doneToday, untilNight))

      const from = today > s.startDate ? today : s.startDate
      const result = buildPlan(topicProgress(topics, events), s, plan.exam_date, {
        from,
        firstDayMinutes: from === today ? firstDayMinutes : undefined,
      })
      unwrap(
        await supabase.from('events').delete().eq('study_plan_id', plan.id).eq('completed', false).neq('study_kind', 'exam'),
      )
      await insertInChunks(eventRows(plan, scheduleTimes(result.sessions, s.startTime, from === today ? firstDayStart : undefined)))
      return result
    },
    onSuccess: invalidate,
  })
}

export function useDeletePlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    // Las sesiones del calendario se borran en cascada; los PDFs se quedan en Documentos.
    mutationFn: async (id: string) => unwrap(await supabase.from('study_plans').delete().eq('id', id)),
    onSuccess: invalidate,
  })
}
