import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { addDays, differenceInCalendarDays, format, isBefore, isSameDay, parseISO, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Empty, PageHeader, Skeleton } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { fromInputs } from '../../lib/dates'
import type { CalendarEvent } from '../../lib/types'
import { useUpdateEvent } from '../calendar/api'
import { KIND_LABEL, topicProgress, useDeletePlan, usePlan, usePlans, useReplan, type PlanBundle } from './api'
import { REVIEW_INTERVALS, formatHours, type PlanSettings } from './planner'
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
            Escribe tus temas (o sube sus PDF), dinos por cuál empiezas y cuántas horas tienes al día. Te decimos qué estudiar cada día y cuándo repasar cada tema para que no se te olvide: a 1, 3, 7, 15 y 30 días de aprenderlo. Todo queda en tu calendario.
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

function PlanView({ bundle }: { bundle: PlanBundle }) {
  const { plan, topics, events } = bundle
  const navigate = useNavigate()
  const replan = useReplan()
  const del = useDeletePlan()
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const now = new Date()
  const today = startOfDay(now)

  const sessions = events.filter((e) => e.study_kind !== 'exam')
  const progress = topicProgress(topics, events)
  const learned = progress.filter((t) => t.remainingMinutes === 0).length
  const total = progress.reduce((s, t) => s + t.totalMinutes, 0)
  const done = progress.reduce((s, t) => s + t.totalMinutes - t.remainingMinutes, 0)
  const pct = total ? Math.round((done / total) * 100) : 0
  const todays = sessions.filter((e) => isSameDay(parseISO(e.start_at), now))
  const overdue = sessions.filter((e) => !e.completed && isBefore(parseISO(e.start_at), today))
  const upcoming = sessions.filter((e) => {
    const d = parseISO(e.start_at)
    return d >= addDays(today, 1) && d < addDays(today, 8)
  })
  const left = daysUntil(plan.exam_date)

  async function doReplan(settings?: PlanSettings) {
    setNotice(null)
    try {
      const result = await replan.mutateAsync({ bundle, settings })
      setEditing(false)
      setNotice(result.warnings[0] ?? 'Plan recalculado desde hoy con lo que llevas hecho.')
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
            <Button size="sm" variant="secondary" onClick={() => doReplan()} disabled={replan.isPending}>
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
          <h2 className="text-[13px] font-medium text-ink-500">Temario estudiado</h2>
          <span className="font-mono text-sm tabular-nums text-ink-900">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: plan.color }} />
        </div>
        <dl className="grid grid-cols-3 gap-2">
          <Stat label="Temas aprendidos" value={`${learned}/${topics.length}`} />
          <Stat label="Horas hechas" value={formatHours(done)} />
          <Stat label="Repasos hechos" value={String(sessions.filter((e) => e.completed && e.study_kind === 'review').length)} />
        </dl>
      </section>

      {overdue.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <span className="flex-1">
            Tienes <strong>{overdue.length}</strong> sesión{overdue.length === 1 ? '' : 'es'} atrasada{overdue.length === 1 ? '' : 's'}. Recalcula para repartirlas en los próximos días.
          </span>
          <Button size="sm" onClick={() => doReplan()} disabled={replan.isPending}>
            Recalcular
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Hoy toca">
          <SessionList events={todays} bundle={bundle} empty={left > 0 ? 'Hoy no tienes sesiones. ¡Descansa!' : 'El plan ha terminado.'} />
        </Card>
        <Card title="Próximos 7 días">
          <SessionList events={upcoming} bundle={bundle} empty="Nada en los próximos días." showDay />
        </Card>
      </div>

      <Card title="Temas">
        <ol className="-mx-2">
          {topics.map((t, i) => {
            const p = progress[i]
            const status =
              p.remainingMinutes === 0
                ? `Aprendido · repasos ${p.reviewsDone}/${REVIEW_INTERVALS.length}`
                : p.remainingMinutes < p.totalMinutes
                  ? `En curso · quedan ${formatHours(p.remainingMinutes)}`
                  : `Pendiente · ${formatHours(p.totalMinutes)}`
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-50">
                <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-ink-400">{i + 1}</span>
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-full ${p.remainingMinutes === 0 ? 'text-white' : 'ring-1 ring-inset ring-ink-300'}`}
                  style={p.remainingMinutes === 0 ? { background: plan.color } : undefined}
                >
                  {p.remainingMinutes === 0 && <Icon name="check" size={12} strokeWidth={2.4} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{t.title}</p>
                  <p className="truncate text-xs text-ink-500">{status}</p>
                </div>
                {t.note_id && t.notes && (
                  <Link
                    to={`/notes/${t.notes.section_id}/${t.note_id}`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent-600 hover:bg-accent-50"
                  >
                    <Icon name="notes" size={14} /> Abrir
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      </Card>

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

function SessionList({ events, bundle, empty, showDay = false }: { events: CalendarEvent[]; bundle: PlanBundle; empty: string; showDay?: boolean }) {
  const update = useUpdateEvent()
  const qc = useQueryClient()
  if (events.length === 0) return <Empty icon="study">{empty}</Empty>

  function toggle(e: CalendarEvent) {
    // Se marca al momento en la pantalla y se guarda por detrás.
    qc.setQueryData<PlanBundle>(['plans', 'one', bundle.plan.id], (prev) =>
      prev ? { ...prev, events: prev.events.map((x) => (x.id === e.id ? { ...x, completed: !e.completed } : x)) } : prev,
    )
    update.mutate({ id: e.id, completed: !e.completed }, { onSettled: () => qc.invalidateQueries({ queryKey: ['plans', 'one', bundle.plan.id] }) })
  }

  return (
    <ul className="-mx-2">
      {events.map((e) => {
        const start = parseISO(e.start_at)
        const topic = bundle.topics.find((t) => t.id === e.study_topic_id)
        return (
          <li key={e.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-50">
            <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-ink-500 first-letter:uppercase">
              {showDay ? format(start, 'EEE d', { locale: es }) : format(start, 'HH:mm')}
            </span>
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-accent-500"
              checked={e.completed}
              onChange={() => toggle(e)}
              aria-label="Marcar como hecha"
            />
            <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: e.color }} />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-medium ${e.completed ? 'text-ink-400 line-through' : 'text-ink-900'}`}>{e.title}</p>
              <p className="truncate text-xs text-ink-500">
                {e.study_kind ? KIND_LABEL[e.study_kind] : ''}
                {e.end_at && ` · ${format(start, 'HH:mm')}–${format(parseISO(e.end_at), 'HH:mm')}`}
              </p>
            </div>
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
