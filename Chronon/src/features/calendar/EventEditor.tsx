import { createContext, useCallback, useContext, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { addDays, addHours, parseISO, setMinutes, startOfHour } from 'date-fns'
import { Modal } from '../../components/Modal'
import { Button, ColorPicker, Empty, Field, Segmented, Skeleton, inputClass } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { fromInputs, toDateInput, toTimeInput } from '../../lib/dates'
import type { EventType, EventWithAlerts } from '../../lib/types'
import { AlertPicker } from './AlertPicker'
import { useDeleteEvent, useEvent, useSaveEvent } from './api'

export interface NewEventDefaults {
  type: EventType
  start?: Date
  allDay?: boolean
}

type EditorState = { mode: 'new'; defaults: NewEventDefaults } | { mode: 'edit'; id: string } | null

const EditorContext = createContext<{ openNew: (d: NewEventDefaults) => void; openEdit: (id: string) => void }>({
  openNew: () => {},
  openEdit: () => {},
})

export const useEventEditor = () => useContext(EditorContext)

export function EventEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState>(null)
  const openNew = useCallback((defaults: NewEventDefaults) => setState({ mode: 'new', defaults }), [])
  const openEdit = useCallback((id: string) => setState({ mode: 'edit', id }), [])
  const close = useCallback(() => setState(null), [])
  const value = useMemo(() => ({ openNew, openEdit }), [openNew, openEdit])

  return (
    <EditorContext.Provider value={value}>
      {children}
      {state?.mode === 'new' && <EventForm defaults={state.defaults} onClose={close} />}
      {state?.mode === 'edit' && <EditLoader id={state.id} onClose={close} />}
    </EditorContext.Provider>
  )
}

function EditLoader({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, error } = useEvent(id)
  if (isLoading) return <Modal title="Abriendo…" onClose={onClose}><Skeleton rows={4} /></Modal>
  if (error || !data)
    return <Modal title="No encontrado" onClose={onClose}><Empty icon="calendar">Este evento ya no existe.</Empty></Modal>
  return <EventForm event={data} onClose={onClose} />
}

interface FormState {
  type: EventType
  title: string
  description: string
  color: string
  allDay: boolean
  date: string
  startTime: string
  endDate: string
  endTime: string
  completed: boolean
  offsets: number[]
}

function initialState(event?: EventWithAlerts, defaults?: NewEventDefaults): FormState {
  if (event) {
    const start = parseISO(event.start_at)
    let end = event.end_at ? parseISO(event.end_at) : addHours(start, 1)
    if (event.all_day) end = event.end_at ? addDays(end, -1) : start
    return {
      type: event.type,
      title: event.title,
      description: event.description ?? '',
      color: event.color,
      allDay: event.all_day,
      date: toDateInput(start),
      startTime: toTimeInput(start),
      endDate: toDateInput(end),
      endTime: toTimeInput(end),
      completed: event.completed,
      offsets: event.event_alerts.map((a) => a.offset_minutes).sort((a, b) => b - a),
    }
  }
  const type = defaults?.type ?? 'event'
  const allDay = defaults?.allDay ?? false
  const start = defaults?.start ?? setMinutes(startOfHour(addHours(new Date(), 1)), 0)
  const end = addHours(start, 1)
  return {
    type,
    title: '',
    description: '',
    color: type === 'reminder' ? '#c9962c' : '#3b6ea8',
    allDay,
    date: toDateInput(start),
    startTime: toTimeInput(start),
    endDate: toDateInput(start),
    endTime: toTimeInput(end),
    completed: false,
    offsets: allDay ? [1440] : type === 'reminder' ? [0] : [60],
  }
}

function EventForm({ event, defaults, onClose }: { event?: EventWithAlerts; defaults?: NewEventDefaults; onClose: () => void }) {
  const [f, setF] = useState<FormState>(() => initialState(event, defaults))
  const [error, setError] = useState<string | null>(null)
  const save = useSaveEvent()
  const del = useDeleteEvent()
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((prev) => ({ ...prev, [key]: value }))

  const start = f.date ? fromInputs(f.date, f.allDay ? '00:00' : f.startTime) : null
  const isEvent = f.type === 'event'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!start) return setError('Pon una fecha')

    let end: Date | null = null
    if (isEvent && f.allDay) {
      end = f.endDate > f.date ? addDays(fromInputs(f.endDate), 1) : null
    } else if (isEvent) {
      end = fromInputs(f.endDate || f.date, f.endTime)
      if (end <= start) return setError('La hora de fin debe ser posterior al inicio')
    }

    try {
      await save.mutateAsync({
        id: event?.id,
        offsets: f.offsets,
        values: {
          type: f.type,
          title: f.title.trim(),
          description: f.description.trim() || null,
          color: f.color,
          all_day: f.allDay,
          start_at: start.toISOString(),
          end_at: end?.toISOString() ?? null,
          completed: isEvent ? false : f.completed,
        },
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function remove() {
    if (!event || !confirm('¿Borrar este elemento?')) return
    await del.mutateAsync(event.id)
    onClose()
  }

  return (
    <Modal title={event ? 'Editar' : isEvent ? 'Nuevo evento' : 'Nuevo recordatorio'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Segmented
          className="w-full"
          value={f.type}
          onChange={(t) => set('type', t)}
          options={[
            { value: 'event', label: <><Icon name="calendar" size={15} /> Evento</> },
            { value: 'reminder', label: <><Icon name="bell" size={15} /> Recordatorio</> },
          ]}
        />

        <Field label="Título">
          <input className={inputClass} required autoFocus value={f.title} onChange={(e) => set('title', e.target.value)} placeholder={isEvent ? 'Reunión con…' : 'Llamar a…'} />
        </Field>

        <Switch checked={f.allDay} onChange={(v) => set('allDay', v)} label="Todo el día" />

        <div className="grid grid-cols-2 gap-3">
          <Field label={isEvent ? 'Empieza' : 'Fecha'}>
            <input
              type="date"
              required
              className={inputClass}
              value={f.date}
              onChange={(e) => setF((p) => ({ ...p, date: e.target.value, endDate: p.endDate < e.target.value ? e.target.value : p.endDate }))}
            />
          </Field>
          {!f.allDay && (
            <Field label="Hora">
              <input type="time" required className={inputClass} value={f.startTime} onChange={(e) => set('startTime', e.target.value)} />
            </Field>
          )}
          {isEvent && (
            <>
              <Field label="Termina">
                <input type="date" className={inputClass} min={f.date} value={f.endDate} onChange={(e) => set('endDate', e.target.value)} />
              </Field>
              {!f.allDay && (
                <Field label="Hora fin">
                  <input type="time" required className={inputClass} value={f.endTime} onChange={(e) => set('endTime', e.target.value)} />
                </Field>
              )}
            </>
          )}
        </div>

        <Field label="Avisos">
          <AlertPicker value={f.offsets} onChange={(v) => set('offsets', v)} start={start} allDay={f.allDay} />
        </Field>

        <Field label="Notas">
          <textarea className={`${inputClass} min-h-24 resize-y`} placeholder="Dirección, enlace, lo que haga falta…" value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>

        <Field label="Color">
          <ColorPicker value={f.color} onChange={(c) => set('color', c)} />
        </Field>

        {!isEvent && event && (
          <Switch checked={f.completed} onChange={(v) => set('completed', v)} label="Hecho" />
        )}

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

        <div className="-mx-6 flex items-center gap-2 border-t border-ink-100 px-6 pt-4">
          {event && (
            <Button type="button" variant="danger" onClick={remove} className="-ml-3">
              <Icon name="trash" size={16} /> Borrar
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-ink-800">
      {label}
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-6 w-10 shrink-0 rounded-full bg-ink-200 transition-colors duration-200 peer-checked:bg-accent-500 peer-focus-visible:ring-4 peer-focus-visible:ring-accent-100 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200 peer-checked:after:translate-x-4" />
    </label>
  )
}
