import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin, { type DateClickArg, type EventResizeDoneArg } from '@fullcalendar/interaction'
import esLocale from '@fullcalendar/core/locales/es'
import type { EventDropArg, EventInput } from '@fullcalendar/core'
import { setHours } from 'date-fns'
import { Button, PageHeader, Toggle } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useEventEditor } from './EventEditor'
import { useEventsInRange, useUpdateEvent } from './api'

export function CalendarPage() {
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null)
  const [show, setShow] = useState({ event: true, reminder: true })
  const { data: events = [] } = useEventsInRange(range)
  const update = useUpdateEvent()
  const { openNew, openEdit } = useEventEditor()
  const [params, setParams] = useSearchParams()

  // Al pulsar una notificación se abre /calendar?event=<id>
  useEffect(() => {
    const id = params.get('event')
    if (id) {
      openEdit(id)
      setParams({}, { replace: true })
    }
  }, [params, setParams, openEdit])

  const fcEvents = useMemo<EventInput[]>(
    () =>
      events
        .filter((e) => show[e.type])
        .map((e) => ({
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
    [events, show],
  )

  function handleMove(arg: EventDropArg | EventResizeDoneArg) {
    const { event } = arg
    update.mutate(
      { id: event.id, start_at: event.start!.toISOString(), end_at: event.end?.toISOString() ?? null, all_day: event.allDay },
      { onError: () => arg.revert() },
    )
  }

  function handleDateClick(arg: DateClickArg) {
    // En la vista de mes, un clic en un día propone un evento a las 9:00.
    if (arg.view.type === 'dayGridMonth') openNew({ type: 'event', start: setHours(arg.date, 9) })
    else openNew({ type: 'event', start: arg.date, allDay: arg.allDay })
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Mes, semana o día" title="Calendario">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['event', 'reminder'] as const).map((t) => (
            <Toggle key={t} on={show[t]} onClick={() => setShow((s) => ({ ...s, [t]: !s[t] }))}>
              <Icon name={t === 'event' ? 'calendar' : 'bell'} size={14} />
              {t === 'event' ? 'Eventos' : 'Recordatorios'}
            </Toggle>
          ))}
          <Button size="sm" variant="secondary" onClick={() => openNew({ type: 'reminder' })} className="ml-1">
            <Icon name="plus" size={14} strokeWidth={2} /> Recordatorio
          </Button>
        </div>
      </PageHeader>
      <div className="animate-rise rounded-2xl bg-surface p-3 shadow-soft ring-1 ring-ink-200/70 sm:p-5">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={esLocale}
          firstDay={1}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
          height="auto"
          editable
          dayMaxEvents={3}
          nowIndicator
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          events={fcEvents}
          datesSet={(arg) => setRange({ start: arg.start, end: arg.end })}
          dateClick={handleDateClick}
          eventClick={(arg) => openEdit(arg.event.id)}
          eventDrop={handleMove}
          eventResize={handleMove}
        />
      </div>
    </div>
  )
}
