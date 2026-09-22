import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from '../../lib/supabase'
import { COLORS } from '../../components/ui'
import type { Note, NoteSection } from '../../lib/types'

export function useSections() {
  return useQuery({
    queryKey: ['sections'],
    queryFn: async () =>
      unwrap(await supabase.from('note_sections').select('*').order('position').order('created_at')) as NoteSection[],
  })
}

export function useCreateSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const sections = qc.getQueryData<NoteSection[]>(['sections']) ?? []
      const position = sections.reduce((max, s) => Math.max(max, s.position), -1) + 1
      return unwrap(
        await supabase
          .from('note_sections')
          .insert({ name, position, color: COLORS[sections.length % COLORS.length] })
          .select()
          .single(),
      ) as NoteSection
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sections'] }),
  })
}

export function useUpdateSections() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patches: (Partial<NoteSection> & { id: string })[]) => {
      for (const { id, ...patch } of patches) unwrap(await supabase.from('note_sections').update(patch).eq('id', id))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['sections'] }),
  })
}

export function useDeleteSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('note_sections').delete().eq('id', id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sections'] })
      qc.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export type NoteSummary = Omit<Note, 'content'>

export function useNotes(sectionId: string | undefined, search: string) {
  const term = search.trim().replace(/[,()%*]/g, ' ')
  return useQuery({
    queryKey: ['notes', 'list', sectionId, term],
    enabled: !!sectionId,
    queryFn: async () => {
      let query = supabase
        .from('notes')
        .select('id, section_id, title, content_text, pinned, updated_at')
        .eq('section_id', sectionId!)
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false })
      if (term) query = query.or(`title.ilike.*${term}*,content_text.ilike.*${term}*`)
      return unwrap(await query) as NoteSummary[]
    },
  })
}

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: ['notes', 'one', id],
    enabled: !!id,
    // El editor es la fuente de verdad mientras está abierto; no recargar por debajo.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => unwrap(await supabase.from('notes').select('*').eq('id', id!).single()) as Note,
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (sectionId: string) =>
      unwrap(await supabase.from('notes').insert({ section_id: sectionId }).select().single()) as Note,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'list'] }),
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Note> & { id: string }) =>
      unwrap(await supabase.from('notes').update(patch).eq('id', id)),
    onSuccess: (_data, { id, ...patch }) => {
      qc.setQueryData<Note>(['notes', 'one', id], (prev) => (prev ? { ...prev, ...patch } : prev))
      qc.invalidateQueries({ queryKey: ['notes', 'list'] })
    },
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('notes').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'list'] }),
  })
}
