import { useEffect, useState } from 'react'
import { format, isSameDay, parseISO, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card, Empty, Skeleton } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { formatEventWhen } from '../../lib/dates'
import type { CalendarEvent } from '../../lib/types'
import { AlertsList } from '../alerts/AlertsList'
import { useDueAlerts } from '../alerts/api'
import { useEventEditor } from '../calendar/EventEditor'
import { useUpcoming, useUpdateEvent } from '../calendar/api'

function greeting(h: number) {
  if (h < 6) return 'Buenas noches'
  if (h < 14) return 'Buenos días'
  if (h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function HomePage() {
  const { data, isLoading } = useUpcoming(7)
  const { data: alerts = [] } = useDueAlerts()
  const { openNew } = useEventEditor()
  const today = useNow()

  const upcoming = data?.upcoming ?? []
  const isOnToday = (e: CalendarEvent) => {
    const start = parseISO(e.start_at)
    const end = e.end_at ? parseISO(e.end_at) : start
    return isSameDay(start, today) || (start < today && end > startOfDay(today))
  }
  const todayEvents = upcoming.filter(isOnToday)
  const nextEvents = upcoming.filter((e) => !isOnToday(e))
  const overdue = data?.overdue ?? []
  const dayPct = Math.round(((today.getHours() * 60 + today.getMinutes()) / 1440) * 100)

  return (
    <div className="space-y-8">
      <section className="animate-rise pt-2">
        <p className="text-[13px] text-ink-500">{greeting(today.getHours())}</p>
        <h1 className="mt-1 font-display text-5xl leading-[0.95] tracking-tight first-letter:uppercase sm:text-7xl">
          {format(today, 'EEEE', { locale: es })}
          <span className="text-ink-400">, </span>
          <em className="text-ink-500">{format(today, "d 'de' MMMM", { locale: es })}</em>
        </h1>

        <div className="mt-6 flex max-w-xl items-center gap-3">
          <span className="font-mono text-xs tabular-nums text-ink-500">{format(today, 'HH:mm')}</span>
          <div className="relative h-1 flex-1 rounded-full bg-ink-200">
            <div className="absolute inset-y-0 left-0 rounded-full bg-ink-900" style={{ width: `${dayPct}%` }} />
            <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500 ring-4 ring-ink-50" style={{ left: `${dayPct}%` }} />
          </div>
          <span className="font-mono text-xs tabular-nums text-ink-400">{dayPct}% del día</span>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={() => openNew({ type: 'event' })}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink-900 px-4 text-sm font-medium text-ink-50 transition-[background-color,transform] duration-200 hover:bg-ink-800 active:scale-[0.98]"
          >
            <Icon name="calendar" size={16} /> Nuevo evento
          </button>
          <button
            onClick={() => openNew({ type: 'reminder' })}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-medium text-ink-800 shadow-soft ring-1 ring-ink-200 transition-[background-color,transform] duration-200 hover:bg-ink-50 active:scale-[0.98]"
          >
            <Icon name="bell" size={16} /> Nuevo recordatorio
          </button>
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card title={<Count label="Hoy" n={todayEvents.length} />} className="animate-rise [animation-delay:60ms]">
            {isLoading ? <Skeleton /> : <EventList events={todayEvents} leading="time" empty="Nada en la agenda de hoy. Día libre." />}
          </Card>
          <Card title={<Count label="Próximos 7 días" n={nextEvents.length} />} className="animate-rise [animation-delay:120ms]">
            {isLoading ? <Skeleton rows={4} /> : <EventList events={nextEvents} leading="day" empty="Semana despejada." />}
          </Card>
        </div>
        <div className="space-y-4">
          {overdue.length > 0 && (
            <Card title={<Count label="Recordatorios atrasados" n={overdue.length} tone="text-red-600" />} className="animate-rise [animation-delay:90ms]">
              <EventList events={overdue} leading="day" empty="" />
            </Card>
          )}
          <Card title={<Count label="Avisos" n={alerts.length} />} className="animate-rise [animation-delay:150ms]">
            <AlertsList />
          </Card>
        </div>
      </div>
    </div>
  )
}

function Count({ label, n, tone = 'text-ink-400' }: { label: string; n: number; tone?: string }) {
  return (
    <span className="flex items-baseline gap-2">
      {label}
      {n > 0 && <span className={`font-mono text-xs tabular-nums ${tone}`}>{String(n).padStart(2, '0')}</span>}
    </span>
  )
}

function EventList({ events, empty, leading }: { events: CalendarEvent[]; empty: string; leading: 'time' | 'day' }) {
  const { openEdit } = useEventEditor()
  const update = useUpdateEvent()
  if (events.length === 0) return <Empty icon="clock">{empty}</Empty>

  return (
    <ul className="-mx-2">
      {events.map((e) => {
        const start = parseISO(e.start_at)
        return (
          <li key={e.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-200 hover:bg-ink-50">
            <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-ink-500">
              {leading === 'time' ? (e.all_day ? 'día' : format(start, 'HH:mm')) : format(start, 'EEE d', { locale: es })}
            </span>
            {e.type === 'reminder' ? (
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-accent-500"
                checked={e.completed}
                onChange={() => update.mutate({ id: e.id, completed: !e.completed })}
                aria-label="Marcar como hecho"
              />
            ) : (
              <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: e.color }} />
            )}
            <button className="min-w-0 flex-1 text-left" onClick={() => openEdit(e.id)}>
              <p className={`truncate text-sm font-medium ${e.completed ? 'text-ink-400 line-through' : 'text-ink-900'}`}>{e.title}</p>
              <p className="truncate text-xs text-ink-500">{formatEventWhen(e.start_at, e.all_day, e.end_at)}</p>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
