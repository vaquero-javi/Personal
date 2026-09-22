import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, startOfDay } from 'date-fns'
import { supabase, unwrap } from '../../lib/supabase'
import type { CalendarEvent, EventWithAlerts } from '../../lib/types'

export type EventInput = Omit<CalendarEvent, 'id' | 'created_at'>

export function useEventsInRange(range: { start: Date; end: Date } | null) {
  return useQuery({
    queryKey: ['events', 'range', range?.start.toISOString(), range?.end.toISOString()],
    enabled: !!range,
    queryFn: async () => {
      const start = range!.start.toISOString()
      const end = range!.end.toISOString()
      return unwrap(
        await supabase
          .from('events')
          .select('*')
          .lt('start_at', end)
          .or(`start_at.gte.${start},end_at.gt.${start}`)
          .order('start_at'),
      ) as CalendarEvent[]
    },
  })
}

export function useEvent(id: string | null) {
  return useQuery({
    queryKey: ['events', 'one', id],
    enabled: !!id,
    queryFn: async () =>
      unwrap(await supabase.from('events').select('*, event_alerts(id, offset_minutes)').eq('id', id!).single()) as EventWithAlerts,
  })
}

/** Eventos de hoy y los próximos días + recordatorios atrasados sin completar. */
export function useUpcoming(days = 7) {
  return useQuery({
    queryKey: ['events', 'upcoming', days],
    queryFn: async () => {
      const from = startOfDay(new Date())
      const to = addDays(from, days + 1)
      const [upcoming, overdue] = await Promise.all([
        supabase
          .from('events')
          .select('*')
          .lt('start_at', to.toISOString())
          .or(`start_at.gte.${from.toISOString()},end_at.gt.${from.toISOString()}`)
          .order('start_at'),
        supabase
          .from('events')
          .select('*')
          .eq('type', 'reminder')
          .eq('completed', false)
          .lt('start_at', from.toISOString())
          .order('start_at'),
      ])
      return { upcoming: unwrap(upcoming) as CalendarEvent[], overdue: unwrap(overdue) as CalendarEvent[] }
    },
  })
}

/**
 * Para la línea de tiempo: los últimos `daysBack` días, los próximos `daysAhead`
 * y todos los recordatorios pendientes, aunque estén atrasados.
 */
export function useTimeline(daysBack: number, daysAhead: number) {
  return useQuery({
    queryKey: ['events', 'timeline', daysBack, daysAhead],
    queryFn: async () => {
      const today = startOfDay(new Date())
      const from = addDays(today, -daysBack).toISOString()
      const to = addDays(today, daysAhead + 1).toISOString()
      const [inRange, pending] = await Promise.all([
        supabase.from('events').select('*').gte('start_at', from).lt('start_at', to).order('start_at'),
        supabase.from('events').select('*').eq('type', 'reminder').eq('completed', false).lt('start_at', from).order('start_at'),
      ])
      return [...(unwrap(pending) as CalendarEvent[]), ...(unwrap(inRange) as CalendarEvent[])]
    },
  })
}

function useInvalidateEvents() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['events'] })
    qc.invalidateQueries({ queryKey: ['alerts'] })
  }
}

export function useSaveEvent() {
  const invalidate = useInvalidateEvents()
  return useMutation({
    mutationFn: async ({ id, values, offsets }: { id?: string; values: EventInput; offsets: number[] }) => {
      let eventId = id
      if (eventId) unwrap(await supabase.from('events').update(values).eq('id', eventId))
      else eventId = (unwrap(await supabase.from('events').insert(values).select('id').single()) as { id: string }).id

      // Sincroniza avisos conservando el estado de los que no cambian.
      const existing = unwrap(
        await supabase.from('event_alerts').select('id, offset_minutes').eq('event_id', eventId),
      ) as { id: string; offset_minutes: number }[]
      const toDelete = existing.filter((a) => !offsets.includes(a.offset_minutes)).map((a) => a.id)
      const toAdd = offsets.filter((o) => !existing.some((a) => a.offset_minutes === o))
      if (toDelete.length) unwrap(await supabase.from('event_alerts').delete().in('id', toDelete))
      if (toAdd.length)
        unwrap(await supabase.from('event_alerts').insert(toAdd.map((offset_minutes) => ({ event_id: eventId, offset_minutes }))))
      return eventId
    },
    onSuccess: invalidate,
  })
}

export function useUpdateEvent() {
  const invalidate = useInvalidateEvents()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CalendarEvent> & { id: string }) =>
      unwrap(await supabase.from('events').update(patch).eq('id', id)),
    onSettled: invalidate,
  })
}

export function useDeleteEvent() {
  const invalidate = useInvalidateEvents()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('events').delete().eq('id', id)),
    onSuccess: invalidate,
  })
}
