import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { format, isSameDay, isToday, isTomorrow, isYesterday, parseISO, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Empty, PageHeader, Segmented, Skeleton, Toggle } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { CalendarEvent } from '../../lib/types'
import { useEventEditor } from '../calendar/EventEditor'
import { useTimeline, useUpdateEvent } from '../calendar/api'
import { getTimelineInfo, STATUS_STYLE, type Status } from './status'

type Filter = 'all' | 'pending' | 'done'

const RANGES = [
  { days: 30, label: '30 días' },
  { days: 90, label: '3 meses' },
  { days: 365, label: '1 año' },
]

/** Fecha actual que se refresca cada minuto para que las cuentas atrás avancen. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

function dayLabel(d: Date) {
  if (isToday(d)) return 'Hoy'
  if (isTomorrow(d)) return 'Mañana'
  if (isYesterday(d)) return 'Ayer'
  return format(d, "EEEE d 'de' MMMM", { locale: es })
}

export function TimelinePage() {
  const [range, setRange] = useState(30)
  const [filter, setFilter] = useState<Filter>('all')
  const [types, setTypes] = useState({ event: true, reminder: true })
  const { data: events = [], isLoading } = useTimeline(30, range)
  const now = useNow()
  const nowRef = useRef<HTMLLIElement>(null)
  const scrolled = useRef(false)

  const items = useMemo(
    () =>
      events
        .filter((e) => types[e.type])
        .map((e) => ({ event: e, info: getTimelineInfo(e, now) }))
        .filter(({ info }) =>
          filter === 'all' ? true : filter === 'done' ? info.status === 'done' || info.status === 'finished' : !['done', 'finished'].includes(info.status),
        ),
    [events, types, filter, now],
  )

  const reminders = events.filter((e) => e.type === 'reminder')
  const counts = reminders.reduce(
    (acc, e) => {
      acc[getTimelineInfo(e, now).status]++
      return acc
    },
    { done: 0, overdue: 0, pending: 0, 'in-progress': 0, finished: 0 } as Record<Status, number>,
  )
  const donePct = reminders.length ? Math.round((counts.done / reminders.length) * 100) : 0

  // Posición del marcador "Ahora": antes del primer elemento que aún no ha empezado.
  const nowIndex = items.findIndex(({ event }) => parseISO(event.start_at) > now)
  const markerAt = nowIndex === -1 ? items.length : nowIndex

  useEffect(() => {
    if (!scrolled.current && items.length && nowRef.current) {
      nowRef.current.scrollIntoView({ block: 'center' })
      scrolled.current = true
    }
  }, [items.length])

  const nowMarker = (
    <li ref={nowRef} className="relative flex items-center gap-3 py-4 scroll-mt-28">
      <span className="absolute left-[7px] size-3.5 rounded-full bg-accent-500 ring-4 ring-accent-100" />
      <span className="ml-9 font-mono text-xs font-medium tabular-nums text-accent-600">AHORA · {format(now, 'HH:mm')}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-accent-300 to-transparent" />
    </li>
  )

  const summary = [
    { key: 'done', label: 'Hechos' },
    { key: 'pending', label: 'Pendientes' },
    { key: 'overdue', label: 'Atrasados' },
  ] as const

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader eyebrow="Lo que ya pasó y lo que viene" title="Timeline" />

      <section className="animate-rise rounded-2xl bg-surface p-5 shadow-soft ring-1 ring-ink-200/70">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium text-ink-500">Recordatorios</h2>
          <span className="font-mono text-xs tabular-nums text-ink-500">{donePct}% hechos</span>
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-ink-100">
          {summary.map(({ key, label }) => (
            <div key={key} className="px-4 first:pl-0">
              <div className="flex items-center gap-1.5 text-xs text-ink-500">
                <span className={`size-2 rounded-full ${STATUS_STYLE[key].bar}`} />
                {label}
              </div>
              <div className="mt-1 font-display text-4xl leading-none tabular-nums">{counts[key]}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-ink-100">
          {summary.map(({ key }) =>
            counts[key] ? <div key={key} className={`rounded-full ${STATUS_STYLE[key].bar}`} style={{ width: `${(counts[key] / reminders.length) * 100}%` }} /> : null,
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todo' },
            { value: 'pending', label: 'Pendiente' },
            { value: 'done', label: 'Hecho' },
          ]}
        />
        {(['event', 'reminder'] as const).map((t) => (
          <Toggle key={t} on={types[t]} onClick={() => setTypes((s) => ({ ...s, [t]: !s[t] }))}>
            <Icon name={t === 'event' ? 'calendar' : 'bell'} size={14} />
            {t === 'event' ? 'Eventos' : 'Recordatorios'}
          </Toggle>
        ))}
        <div className="relative ml-auto">
          <select
            className="h-8 appearance-none rounded-lg bg-transparent pl-2.5 pr-7 text-[13px] text-ink-600 ring-1 ring-inset ring-ink-200 transition-colors hover:text-ink-900"
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            aria-label="Hasta"
          >
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>Próximos {r.label}</option>
            ))}
          </select>
          <Icon name="chevronDown" size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-400" />
        </div>
      </div>

      {isLoading ? (
        <Skeleton rows={5} />
      ) : items.length === 0 ? (
        <Empty icon="timeline">No hay nada en este periodo.</Empty>
      ) : (
        <ol className="relative">
          <span className="absolute left-[13px] top-2 bottom-2 w-px bg-ink-200" aria-hidden />
          {items.map(({ event, info }, i) => {
            const day = startOfDay(parseISO(event.start_at))
            const prev = items[i - 1]
            const newDay = !prev || !isSameDay(parseISO(prev.event.start_at), day)
            return (
              <Fragment key={event.id}>
                {i === markerAt && nowMarker}
                {newDay && (
                  <li className="relative ml-9 pt-6 pb-2 font-display text-xl leading-none text-ink-800 first-letter:uppercase">
                    {dayLabel(day)}
                  </li>
                )}
                <TimelineItem event={event} info={info} />
              </Fragment>
            )
          })}
          {markerAt === items.length && nowMarker}
        </ol>
      )}
    </div>
  )
}

function TimelineItem({ event, info }: { event: CalendarEvent; info: ReturnType<typeof getTimelineInfo> }) {
  const { openEdit } = useEventEditor()
  const update = useUpdateEvent()
  const style = STATUS_STYLE[info.status]
  const faded = info.status === 'done' || info.status === 'finished'
  const start = parseISO(event.start_at)

  return (
    <li className="relative flex gap-3 py-1">
      <span className={`relative z-10 mt-[18px] ml-[7px] size-3 shrink-0 rounded-full ${style.dot}`} />
      <div
        className={`group ml-1 min-w-0 flex-1 rounded-xl bg-surface p-3 pl-3.5 shadow-soft ring-1 ring-ink-200/70 transition-shadow duration-200 hover:ring-ink-300 ${faded ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 h-9 w-[3px] shrink-0 rounded-full" style={{ background: event.color }} />
          {event.type === 'reminder' && (
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-accent-500"
              checked={event.completed}
              onChange={() => update.mutate({ id: event.id, completed: !event.completed })}
              aria-label="Marcar como hecho"
            />
          )}
          <button className="min-w-0 flex-1 text-left" onClick={() => openEdit(event.id)}>
            <p className={`flex items-center gap-1.5 truncate text-sm font-medium ${event.completed ? 'text-ink-400 line-through' : 'text-ink-900'}`}>
              {event.type === 'reminder' && <Icon name="bell" size={13} className="shrink-0 text-ink-400" />}
              <span className="truncate">{event.title}</span>
            </p>
            <p className="mt-0.5 font-mono text-xs tabular-nums text-ink-500">
              {event.all_day ? 'Todo el día' : format(start, 'HH:mm')}
              {!isSameDay(start, new Date()) && info.status === 'overdue' && ` · ${format(start, 'd MMM', { locale: es })}`}
            </p>
          </button>
          <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ${style.badge}`}>{info.label}</span>
        </div>
        {info.progress !== null && (
          <div className="mt-2.5 ml-[15px] h-1 overflow-hidden rounded-full bg-ink-100" title={`${Math.round(info.progress * 100)}% del tiempo transcurrido`}>
            <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${Math.max(3, info.progress * 100)}%` }} />
          </div>
        )}
      </div>
    </li>
  )
}
