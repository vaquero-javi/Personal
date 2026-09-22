import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from '../../lib/supabase'
import type { AlertWithEvent } from '../../lib/types'

/** Avisos cuyo momento ya ha llegado y no se han descartado. */
export function useDueAlerts() {
  return useQuery({
    queryKey: ['alerts', 'due'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from('event_alerts')
          .select('*, events!inner(*)')
          .lte('fire_at', new Date().toISOString())
          .is('dismissed_at', null)
          .order('fire_at', { ascending: false }),
      ) as AlertWithEvent[]
      return rows.filter((a) => !a.events.completed)
    },
  })
}

export function useDismissAlerts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) =>
      unwrap(await supabase.from('event_alerts').update({ dismissed_at: new Date().toISOString() }).in('id', ids)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })
}

export function useSnoozeAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, minutes }: { id: string; minutes: number }) =>
      unwrap(
        await supabase
          .from('event_alerts')
          .update({ fire_at: new Date(Date.now() + minutes * 60_000).toISOString(), sent_at: null })
          .eq('id', id),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })
}
