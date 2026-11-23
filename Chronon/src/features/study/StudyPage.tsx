import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { addDays, differenceInCalendarDays, differenceInMinutes, format, isBefore, isSameDay, parseISO, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button, Card, Empty, PageHeader, Segmented, Skeleton, Toggle } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { fromInputs } from '../../lib/dates'
import type { CalendarEvent } from '../../lib/types'
import {
  KIND_LABEL,
  topicProgress,
  useDeletePlan,
  usePlan,
  usePlans,
  useReplan,
  useSetDifficulty,
  useToggleSession,
  type PlanBundle,
  type StudyTopic,
} from './api'
import {
  DIFFICULTY_COLOR,
  DIFFICULTY_LABEL,
  REVIEW_INTERVALS,
  formatHours,
  lapLabel,
  lapState,
  type Difficulty,
  type PlanSettings,
  type PlannerTopic,
} from './planner'
import { DifficultyDot, DifficultyPicker } from './Difficulty'
import { StudyMocks } from './StudyMocks'
import { StudyStats } from './StudyStats'
import { PlanWizard, Stat } from './PlanWizard'
import { ScheduleFields } from './ScheduleFields'

export function StudyPage() {
  const { planId } = useParams()
  if (planId === 'new') return <PlanWizard />
  if (planId) return <PlanDetail id={planId} />
  return <PlanList />
}

const daysUntil = (date: string) => differenceInCalendarDays(fromInputs(date), new Date())

function PlanList() {
  const { data: plans = [], isLoading } = usePlans()
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Oposiciones y exámenes" title="Estudio">
        <Link to="/study/new">
          <Button>
            <Icon name="plus" size={16} strokeWidth={2} /> Nuevo plan
          </Button>
        </Link>
      </PageHeader>

      {isLoading ? (
        <Skeleton />
      ) : plans.length === 0 ? (
        <section className="animate-rise rounded-2xl bg-surface p-6 shadow-soft ring-1 ring-ink-200/70 sm:p-8">
          <h2 className="font-display text-3xl leading-none tracking-tight">Planifica tu examen</h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-500">
            Escribe tus temas (o sube sus PDF), dinos por cuál empiezas y cuántas horas tienes al día. Te organizamos el temario en vueltas, cada una más rápida que la anterior, con repasos a 1, 3, 7, 15 y 30 días para que no se te olvide. Cada día tienes tu misión, un semáforo para los temas que peor llevas, tus estadísticas y simulacros con IA. Todo queda en tu calendario.
          </p>
          <Link to="/study/new" className="mt-5 inline-block">
            <Button variant="accent">
              <Icon name="study" size={16} /> Crear mi plan de estudio
            </Button>
          </Link>
        </section>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {plans.map((p) => {
            const left = daysUntil(p.exam_date)
            return (
              <li key={p.id}>
                <Link
                  to={`/study/${p.id}`}
                  className="block animate-rise rounded-2xl bg-surface p-5 shadow-soft ring-1 ring-ink-200/70 transition-shadow duration-200 hover:shadow-float"
                >
                  <span className="mb-3 block h-1 w-10 rounded-full" style={{ background: p.color }} />
                  <h2 className="truncate text-base font-medium text-ink-900">{p.title}</h2>
                  <p className="mt-1 text-sm text-ink-500">
                    {format(fromInputs(p.exam_date), "d 'de' MMMM yyyy", { locale: es })} ·{' '}
                    {left > 0 ? `faltan ${left} días` : left === 0 ? 'es hoy' : 'ya pasó'}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function PlanDetail({ id }: { id: string }) {
  const { data, isLoading, error } = usePlan(id)
  if (isLoading) return <Skeleton rows={5} />
  if (error || !data)
    return (
      <Empty icon="study">
        No se ha encontrado el plan. <Link to="/study" className="text-accent-600 hover:underline">Volver</Link>
      </Empty>
    )
  return <PlanView bundle={data} />
}

type Tab = 'today' | 'topics' | 'stats' | 'mocks'

const TABS: { value: Tab; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'topics', label: 'Temas' },
  { value: 'stats', label: 'Progreso' },
  { value: 'mocks', label: 'Simulacros' },
]

const minutesOf = (e: CalendarEvent) => (e.end_at ? differenceInMinutes(parseISO(e.end_at), parseISO(e.start_at)) : 0)

function PlanView({ bundle }: { bundle: PlanBundle }) {
  const { plan, topics, events } = bundle
  const navigate = useNavigate()
  const replan = useReplan()
  const del = useDeletePlan()
  const [tab, setTab] = useState<Tab>('today')
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const now = new Date()

  const sessions = events.filter((e) => e.study_kind !== 'exam')
  const progress = topicProgress(topics, events)
  const learned = progress.filter((t) => t.remainingMinutes === 0).length
  const total = progress.reduce((s, t) => s + t.totalMinutes, 0)
  const done = progress.reduce((s, t) => s + t.totalMinutes - t.remainingMinutes, 0)
  const studied = progress.reduce((s, t) => s + t.studiedMinutes, 0)
  const pct = total ? Math.round((done / total) * 100) : 0
  // El temario va por la vuelta del tema más atrasado.
  const lap = progress.length ? Math.min(...progress.map((p) => lapState(p).lap)) : 1
  const left = daysUntil(plan.exam_date)

  async function doReplan(settings?: PlanSettings) {
    setNotice(null)
    try {
      const result = await replan.mutateAsync({ bundle, settings })
      setEditing(false)
      setNotice(result.warnings[0] ?? 'Plan recalculado desde hoy con lo que tienes pendiente.')
    } catch (err) {
      setNotice((err as Error).message)
    }
  }

  async function remove() {
    if (!confirm('¿Borrar el plan? Se quitan sus sesiones del calendario; los PDFs se quedan en Documentos.')) return
    await del.mutateAsync(plan.id)
    navigate('/study', { replace: true })
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/study" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <Icon name="back" size={16} /> Planes
        </Link>
        <PageHeader
          eyebrow={`Examen el ${format(fromInputs(plan.exam_date), "d 'de' MMMM", { locale: es })} · ${left > 0 ? `faltan ${left} días` : left === 0 ? 'es hoy' : 'ya pasó'}`}
          title={plan.title}
        >
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => doReplan()} disabled={replan.isPending} title="Reparte de nuevo lo que tienes pendiente desde hoy">
              <Icon name="refresh" size={14} /> {replan.isPending ? 'Recalculando…' : 'Recalcular desde hoy'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <Icon name="clock" size={14} /> Horario
            </Button>
            <Link to="/calendar">
              <Button size="sm" variant="ghost">
                <Icon name="calendar" size={14} /> Calendario
              </Button>
            </Link>
            <Button size="sm" variant="danger" onClick={remove} aria-label="Borrar plan">
              <Icon name="trash" size={14} />
            </Button>
          </div>
        </PageHeader>
      </div>

      {notice && <p className="rounded-xl bg-ink-100 px-3 py-2 text-sm text-ink-700">{notice}</p>}

      <section className="animate-rise space-y-3 rounded-2xl bg-surface p-5 shadow-soft ring-1 ring-ink-200/70">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-medium text-ink-500">
            Temario estudiado{lap > 1 && <span className="text-ink-900"> · vas por la {lapLabel(lap)}</span>}
          </h2>
          <span className="font-mono text-sm tabular-nums text-ink-900">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: plan.color }} />
        </div>
        <dl className="grid grid-cols-3 gap-2">
          <Stat label="Temas aprendidos" value={`${learned}/${topics.length}`} />
          <Stat label="Horas hechas" value={formatHours(studied)} />
          <Stat label="Repasos hechos" value={String(sessions.filter((e) => e.completed && e.study_kind === 'review').length)} />
        </dl>
      </section>

      <Segmented value={tab} onChange={setTab} options={TABS} className="w-full" />

      {tab === 'today' && <TodayTab bundle={bundle} progress={progress} onMock={() => setTab('mocks')} left={left} now={now} />}
      {tab === 'topics' && <TopicsTab bundle={bundle} progress={progress} />}
      {tab === 'stats' && <StudyStats bundle={bundle} />}
      {tab === 'mocks' && <StudyMocks bundle={bundle} progress={progress} />}

      {editing && (
        <EditSchedule
          initial={plan.settings}
          busy={replan.isPending}
          onClose={() => setEditing(false)}
          onSave={(s) => doReplan(s)}
        />
      )}
    </div>
  )
}

function TodayTab({
  bundle,
  progress,
  onMock,
  left,
  now,
}: {
  bundle: PlanBundle
  progress: PlannerTopic[]
  onMock: () => void
  left: number
  now: Date
}) {
  const [showPast, setShowPast] = useState(false)
  const today = startOfDay(now)
  const sessions = bundle.events.filter((e) => e.study_kind !== 'exam')
  const todays = sessions.filter((e) => isSameDay(parseISO(e.start_at), now))
  // Las más recientes primero: lo normal es acordarse de marcar lo de ayer.
  const overdue = sessions.filter((e) => !e.completed && isBefore(parseISO(e.start_at), today)).reverse()
  const upcoming = sessions.filter((e) => {
    const d = parseISO(e.start_at)
    return d >= addDays(today, 1) && d < addDays(today, 8)
  })
  const planned = todays.reduce((s, e) => s + minutesOf(e), 0)
  const doneToday = todays.filter((e) => e.completed).reduce((s, e) => s + minutesOf(e), 0)
  const missionPct = planned ? Math.round((doneToday / planned) * 100) : 0
  // Temas que ya has terminado y todavía no tienen dificultad: se pregunta qué tal han ido.
  const toRate = bundle.topics.filter((t, i) => !t.difficulty && progress[i]?.remainingMinutes === 0)

  return (
    <div className="space-y-4">
      <section className="animate-rise rounded-2xl bg-surface p-5 shadow-soft ring-1 ring-ink-200/70">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[13px] font-medium text-ink-500">
            <Icon name="target" size={15} /> Misión de hoy
          </h2>
          {planned > 0 && (
            <span className="font-mono text-xs tabular-nums text-ink-500">
              {formatHours(doneToday)} de {formatHours(planned)}
            </span>
          )}
        </div>
        {planned > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${missionPct}%`, background: bundle.plan.color }} />
            </div>
            <span className="font-mono text-sm tabular-nums text-ink-900">{missionPct}%</span>
          </div>
        )}
        {planned > 0 && missionPct === 100 && <p className="mb-3 rounded-xl bg-ink-50 px-3 py-2 text-sm text-ink-700">Misión cumplida. ¡Buen trabajo!</p>}
        <SessionList
          events={todays}
          bundle={bundle}
          progress={progress}
          onMock={onMock}
          empty={left > 0 ? 'Hoy no tienes sesiones. ¡Descansa!' : 'El plan ha terminado.'}
        />
      </section>

      {toRate.length > 0 && <RateTopics bundle={bundle} topics={toRate} />}

      {overdue.length > 0 && (
        <Card
          title={
            <span className="flex items-baseline gap-2">
              Días anteriores sin marcar
              <span className="font-mono text-xs tabular-nums text-amber-600">{String(overdue.length).padStart(2, '0')}</span>
            </span>
          }
          action={
            <Button size="sm" variant="ghost" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
              {showPast ? 'Ocultar' : 'Ver'}
              <Icon name="chevronDown" size={14} className={`transition-transform duration-200 ${showPast ? 'rotate-180' : ''}`} />
            </Button>
          }
        >
          <p className="text-sm text-ink-500">
            Lo que no marcaste ya se ha pasado a los próximos días. Si lo hiciste y se te olvidó marcarlo, márcalo aquí y el plan se ajusta solo.
          </p>
          {showPast && (
            <div className="mt-3">
              <SessionList events={overdue} bundle={bundle} progress={progress} onMock={onMock} empty="" showDay />
            </div>
          )}
        </Card>
      )}

      <Card title="Próximos 7 días">
        <SessionList events={upcoming} bundle={bundle} progress={progress} onMock={onMock} empty="Nada en los próximos días." showDay />
      </Card>
    </div>
  )
}

/** Al terminar un tema, se pregunta qué tal ha ido para ajustar sus vueltas y repasos. */
function RateTopics({ bundle, topics }: { bundle: PlanBundle; topics: StudyTopic[] }) {
  const setDifficulty = useSetDifficulty(bundle.plan.id)
  return (
    <Card title="¿Qué tal te han ido estos temas?">
      <p className="mb-3 text-sm text-ink-500">Los has terminado. Márcalos y el plan les dará más o menos tiempo en las próximas vueltas y repasos.</p>
      <ul className="space-y-2">
        {topics.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{t.title}</span>
            <DifficultyPicker value={t.difficulty} disabled={setDifficulty.isPending} onChange={(d) => setDifficulty.mutate({ topic: t, difficulty: d })} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

type Filter = 'all' | Difficulty | 'none'

/** Semáforo de retención: cada tema en verde, ámbar o rojo, para dar más atención a los que peor llevas. */
function TopicsTab({ bundle, progress }: { bundle: PlanBundle; progress: PlannerTopic[] }) {
  const { plan, topics } = bundle
  const setDifficulty = useSetDifficulty(plan.id)
  const [filter, setFilter] = useState<Filter>('all')
  const count = (f: Filter) => topics.filter((t) => (f === 'none' ? !t.difficulty : t.difficulty === f)).length
  const shown = topics.map((t, i) => ({ t, i })).filter(({ t }) => filter === 'all' || (filter === 'none' ? !t.difficulty : t.difficulty === filter))
  const filters: { value: Filter; label: string; color?: string }[] = [
    { value: 'all', label: `Todos ${topics.length}` },
    ...(['hard', 'medium', 'easy'] as const).map((d) => ({ value: d, label: `${DIFFICULTY_LABEL[d]} ${count(d)}`, color: DIFFICULTY_COLOR[d] })),
    ...(count('none') ? [{ value: 'none' as const, label: `Sin marcar ${count('none')}` }] : []),
  ]

  return (
    <Card title={<span className="flex items-center gap-2"><Icon name="traffic" size={15} /> Semáforo de retención</span>}>
      <p className="mb-3 text-sm text-ink-500">
        Marca cada tema según lo llevas. Los difíciles (rojo) reciben más tiempo en cada vuelta y en los repasos, y más preguntas en los simulacros; los fáciles (verde), menos.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <Toggle key={f.value} on={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.color && <span className="size-2 rounded-full" style={{ background: f.color }} />}
            {f.label}
          </Toggle>
        ))}
      </div>
      {shown.length === 0 ? (
        <Empty icon="study">Ningún tema en este color.</Empty>
      ) : (
        <ol className="-mx-2 divide-y divide-ink-100">
          {shown.map(({ t, i }) => {
            const p = progress[i]
            const state = lapState(p)
            const status =
              p.remainingMinutes === 0
                ? `Aprendido · repasos ${p.reviewsDone}/${REVIEW_INTERVALS.length}` +
                  (state.lap > 1 && state.progress > 0 ? ` · ${lapLabel(state.lap)} al ${Math.round(state.progress * 100)} %` : state.lap > 2 ? ` · ${state.lap - 1} vueltas hechas` : '')
                : p.remainingMinutes < p.totalMinutes
                  ? `En curso · quedan ${formatHours(p.remainingMinutes)}`
                  : `Pendiente · ${formatHours(p.totalMinutes)}`
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-2 py-2.5">
                <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-ink-400">{i + 1}</span>
                <DifficultyDot value={t.difficulty} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{t.title}</p>
                  <p className="truncate text-xs text-ink-500">{status}</p>
                </div>
                <div className="flex w-full items-center justify-between gap-2 pl-8 sm:w-auto sm:pl-0">
                  <DifficultyPicker value={t.difficulty} size="sm" disabled={setDifficulty.isPending} onChange={(d) => setDifficulty.mutate({ topic: t, difficulty: d })} />
                  {t.note_id && t.notes && (
                    <Link
                      to={`/notes/${t.notes.section_id}/${t.note_id}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent-600 hover:bg-accent-50"
                    >
                      <Icon name="notes" size={14} /> Abrir
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {setDifficulty.isPending && <p className="mt-2 text-xs text-ink-500">Ajustando el plan…</p>}
    </Card>
  )
}

function SessionList({
  events,
  bundle,
  progress,
  onMock,
  empty,
  showDay = false,
}: {
  events: CalendarEvent[]
  bundle: PlanBundle
  progress: PlannerTopic[]
  onMock: () => void
  empty: string
  showDay?: boolean
}) {
  const toggle = useToggleSession(bundle.plan.id)
  if (events.length === 0) return <Empty icon="study">{empty}</Empty>
  const hasPdfs = bundle.topics.some((t) => t.note_id)

  return (
    <ul className="-mx-2">
      {events.map((e) => {
        const start = parseISO(e.start_at)
        const topic = bundle.topics.find((t) => t.id === e.study_topic_id)
        const p = topic && progress.find((x) => x.id === topic.id)
        const state = p && lapState(p)
        // En las sesiones de estudio se ve cuánto llevas de la vuelta del tema.
        const lapPct = e.study_kind === 'study' && state && (e.study_lap ?? 1) === state.lap ? Math.round(state.progress * 100) : null
        return (
          <li key={e.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-50">
            <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-ink-500 first-letter:uppercase">
              {showDay ? format(start, 'EEE d', { locale: es }) : format(start, 'HH:mm')}
            </span>
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-accent-500"
              checked={e.completed}
              onChange={() => toggle.mutate(e)}
              aria-label="Marcar como hecha"
            />
            <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: e.color }} />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-medium ${e.completed ? 'text-ink-400 line-through' : 'text-ink-900'}`}>{e.title}</p>
              <p className="flex items-center gap-2 truncate text-xs text-ink-500">
                <span className="truncate">
                  {e.study_kind ? KIND_LABEL[e.study_kind] : ''}
                  {e.end_at && ` · ${format(start, 'HH:mm')}–${format(parseISO(e.end_at), 'HH:mm')}`}
                </span>
                {lapPct !== null && (
                  <span className="flex shrink-0 items-center gap-1.5" title="Lo que llevas de este tema en esta vuelta">
                    <span className="h-1 w-10 overflow-hidden rounded-full bg-ink-200">
                      <span className="block h-full rounded-full" style={{ width: `${lapPct}%`, background: bundle.plan.color }} />
                    </span>
                    <span className="font-mono tabular-nums">{lapPct}%</span>
                  </span>
                )}
              </p>
            </div>
            {e.study_kind === 'mock' && hasPdfs && (
              <Button size="sm" variant="secondary" onClick={onMock}>
                <Icon name="sparkles" size={14} /> Hacer
              </Button>
            )}
            {topic?.note_id && topic.notes && (
              <Link
                to={`/notes/${topic.notes.section_id}/${topic.note_id}`}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-900"
                aria-label="Abrir el PDF del tema"
                title="Abrir el PDF del tema"
              >
                <Icon name="notes" size={16} />
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function EditSchedule({
  initial,
  busy,
  onClose,
  onSave,
}: {
  initial: PlanSettings
  busy: boolean
  onClose: () => void
  onSave: (s: PlanSettings) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <Modal title="Horario de estudio" onClose={onClose}>
      <p className="mb-4 text-sm text-ink-500">Al guardar se recalcula el plan desde hoy, conservando lo que ya has marcado como hecho.</p>
      <ScheduleFields value={value} onChange={setValue} showStartDate={false} />
      <div className="flex justify-end gap-2 pt-5">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => onSave(value)} disabled={busy || !value.hoursByWeekday.some((h) => h > 0)}>
          {busy ? 'Recalculando…' : 'Guardar y recalcular'}
        </Button>
      </div>
    </Modal>
  )
}
