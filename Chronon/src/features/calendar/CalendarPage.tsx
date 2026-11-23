import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin, { type DateClickArg, type EventResizeDoneArg } from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { DayCellContentArg, EventDropArg, EventInput } from '@fullcalendar/core'
import { addDays, format, isSameDay, parseISO, setHours, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button, Empty, PageHeader, Toggle } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { CalendarEvent } from '../../lib/types'
import { useEventEditor } from './EventEditor'
import { useEventsInRange, useUpdateEvent } from './api'

/** Móvil en vertical: el mes con títulos no cabe, así que se ve con puntos y la agenda del día debajo. */
const COMPACT_QUERY = '(max-width: 640px)'
const MAX_DOTS = 4

function useCompact() {
  const [compact, setCompact] = useState(() => window.matchMedia(COMPACT_QUERY).matches)
  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY)
    const onChange = () => setCompact(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return compact
}

/** ¿Cae el evento en ese día? Los de todo el día terminan a las 00:00 del día siguiente (sin incluirlo). */
function onDay(e: CalendarEvent, day: Date) {
  const start = parseISO(e.start_at)
  const from = startOfDay(day)
  const to = addDays(from, 1)
  if (!e.end_at) return start >= from && start < to
  const end = parseISO(e.end_at)
  return start < to && (end > from || (end.getTime() === start.getTime() && start >= from))
}

export function CalendarPage() {
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null)
  const [show, setShow] = useState({ event: true, reminder: true, study: true })
  const { data: events = [] } = useEventsInRange(range)
  const update = useUpdateEvent()
  const { openNew, openEdit } = useEventEditor()
  const [params, setParams] = useSearchParams()
  const compact = useCompact()
  const calendar = useRef<FullCalendar>(null)
  const [view, setView] = useState('dayGridMonth')
  const [selected, setSelected] = useState(() => startOfDay(new Date()))

  // Al pulsar una notificación se abre /calendar?event=<id>
  useEffect(() => {
    const id = params.get('event')
    if (id) {
      openEdit(id)
      setParams({}, { replace: true })
    }
  }, [params, setParams, openEdit])

  // La semana no cabe en vertical: al pasar a pantalla estrecha se cambia a la vista de día.
  useEffect(() => {
    if (compact && view === 'timeGridWeek') calendar.current?.getApi().changeView('timeGridDay', selected)
  }, [compact, view, selected])

  const visible = useMemo(() => events.filter((e) => (e.study_plan_id ? show.study : show[e.type])), [events, show])
  const dotsOnly = compact && view === 'dayGridMonth'

  const fcEvents = useMemo<EventInput[]>(
    () =>
      // En el mes compacto los eventos se pintan como puntos dentro de cada día (ver dayCellContent).
      dotsOnly
        ? []
        : visible.map((e) => ({
            id: e.id,
            title: e.completed ? `✓ ${e.title}` : e.title,
            start: e.start_at,
            end: e.end_at ?? undefined,
            allDay: e.all_day,
            backgroundColor: e.color,
            borderColor: e.color,
            durationEditable: e.type === 'event',
            // Los recordatorios se pintan como punto + texto para distinguirlos de los eventos.
            display: e.type === 'reminder' ? 'list-item' : 'auto',
            classNames: e.completed ? ['fc-completed'] : [],
          })),
    [visible, dotsOnly],
  )

  const dayEvents = useMemo(
    () =>
      visible
        .filter((e) => onDay(e, selected))
        .sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start_at.localeCompare(b.start_at)),
    [visible, selected],
  )

  function handleMove(arg: EventDropArg | EventResizeDoneArg) {
    const { event } = arg
    update.mutate(
      { id: event.id, start_at: event.start!.toISOString(), end_at: event.end?.toISOString() ?? null, all_day: event.allDay },
      { onError: () => arg.revert() },
    )
  }

  function handleDateClick(arg: DateClickArg) {
    // En el mes compacto, tocar un día enseña lo que hay ese día debajo.
    if (dotsOnly) return setSelected(startOfDay(arg.date))
    // En la vista de mes, un clic en un día propone un evento a las 9:00.
    if (arg.view.type === 'dayGridMonth') openNew({ type: 'event', start: setHours(arg.date, 9) })
    else openNew({ type: 'event', start: arg.date, allDay: arg.allDay })
  }

  function dayCell(arg: DayCellContentArg) {
    if (!dotsOnly) return arg.dayNumberText
    const mine = visible.filter((e) => onDay(e, arg.date))
    return (
      <span className="fc-compact-cell">
        <span className="fc-compact-number">{arg.date.getDate()}</span>
        <span className="fc-compact-dots" aria-hidden>
          {mine.slice(0, MAX_DOTS).map((e) => (
            <span key={e.id} className={e.completed ? 'opacity-35' : ''} style={{ background: e.color }} />
          ))}
          {mine.length > MAX_DOTS && <b>+</b>}
        </span>
        {mine.length > 0 && <span className="sr-only">, {mine.length} {mine.length === 1 ? 'cosa' : 'cosas'}</span>}
      </span>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Mes, semana o día" title="Calendario">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['event', 'reminder', 'study'] as const).map((t) => (
            <Toggle key={t} on={show[t]} onClick={() => setShow((s) => ({ ...s, [t]: !s[t] }))}>
              <Icon name={t === 'event' ? 'calendar' : t === 'reminder' ? 'bell' : 'study'} size={14} />
              {t === 'event' ? 'Eventos' : t === 'reminder' ? 'Recordatorios' : 'Estudio'}
            </Toggle>
          ))}
          <Button size="sm" variant="secondary" onClick={() => openNew({ type: 'reminder' })} className="ml-1">
            <Icon name="plus" size={14} strokeWidth={2} /> Recordatorio
          </Button>
        </div>
      </PageHeader>
      <div className={`animate-rise rounded-2xl bg-surface p-3 shadow-soft ring-1 ring-ink-200/70 sm:p-5 ${dotsOnly ? 'fc-compact' : ''}`}>
        <FullCalendar
          ref={calendar}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={esLocale}
          firstDay={1}
          headerToolbar={
            compact
              ? { left: 'prev,next', center: 'title', right: 'today dayGridMonth,timeGridDay' }
              : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }
          }
          height="auto"
          editable={!dotsOnly}
          dayMaxEvents={3}
          nowIndicator
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          events={fcEvents}
          dayCellContent={dayCell}
          dayCellClassNames={(arg) => (dotsOnly && isSameDay(arg.date, selected) ? ['fc-day-picked'] : [])}
          datesSet={(arg) => {
            setRange({ start: arg.start, end: arg.end })
            setView(arg.view.type)
            // Al cambiar de mes en el móvil, se elige hoy si está en el mes y si no el día 1.
            if (arg.view.type === 'dayGridMonth') {
              const month = arg.view.currentStart
              setSelected((s) => (s >= month && s < arg.view.currentEnd ? s : new Date() >= month && new Date() < arg.view.currentEnd ? startOfDay(new Date()) : month))
            } else setSelected(startOfDay(arg.view.currentStart))
          }}
          dateClick={handleDateClick}
          eventClick={(arg) => openEdit(arg.event.id)}
          eventDrop={handleMove}
          eventResize={handleMove}
        />
      </div>

      {dotsOnly && (
        <section className="animate-rise rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-ink-200/70" aria-live="polite">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-medium text-ink-900 first-letter:uppercase">{format(selected, "EEEE d 'de' MMMM", { locale: es })}</h2>
            <Button size="sm" variant="secondary" onClick={() => openNew({ type: 'event', start: setHours(selected, 9) })}>
              <Icon name="plus" size={14} strokeWidth={2} /> Añadir
            </Button>
          </div>
          {dayEvents.length === 0 ? (
            <Empty icon="calendar">Nada este día.</Empty>
          ) : (
            <ul className="-mx-2">
              {dayEvents.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => openEdit(e.id)} className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-ink-50">
                    <span className="w-11 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-ink-500">
                      {e.all_day ? 'Todo' : format(parseISO(e.start_at), 'HH:mm')}
                    </span>
                    <span className="mt-0.5 h-4 w-[3px] shrink-0 rounded-full" style={{ background: e.color }} />
                    <span className="min-w-0 flex-1">
                      <span className={`line-clamp-2 text-sm font-medium ${e.completed ? 'text-ink-400 line-through' : 'text-ink-900'}`}>{e.title}</span>
                      {!e.all_day && e.end_at && (
                        <span className="block text-xs text-ink-500">
                          {format(parseISO(e.start_at), 'HH:mm')}–{format(parseISO(e.end_at), 'HH:mm')}
                          {e.type === 'reminder' ? ' · Recordatorio' : ''}
                        </span>
                      )}
                    </span>
                    {e.completed && <Icon name="check" size={16} className="mt-0.5 shrink-0 text-ink-400" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
