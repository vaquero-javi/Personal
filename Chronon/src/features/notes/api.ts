import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from '../../lib/supabase'
import { COLORS } from '../../components/ui'
import type { Note, NoteSection } from '../../lib/types'
import { EMPTY_DRAWING, type NoteDrawing, type PaperStyle } from './drawing'
import { loadPdf } from './pdf'

const BUCKET = 'documents'

/** Borra de Storage los PDFs de las notas indicadas (las filas ya se borran solas en cascada). */
async function removePdfs(filter: { noteId?: string; sectionIds?: string[] }) {
  let query = supabase.from('notes').select('path:drawing->pdf->>path').not('drawing->pdf', 'is', null)
  if (filter.noteId) query = query.eq('id', filter.noteId)
  if (filter.sectionIds) query = query.in('section_id', filter.sectionIds)
  const rows = unwrap(await query) as { path: string | null }[]
  const paths = rows.flatMap((r) => (r.path ? [r.path] : []))
  return async () => {
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
  }
}

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
    mutationFn: async ({ name, parentId = null, color }: { name: string; parentId?: string | null; color?: string }) => {
      const sections = qc.getQueryData<NoteSection[]>(['sections']) ?? []
      const siblings = sections.filter((s) => s.parent_id === parentId)
      const position = siblings.reduce((max, s) => Math.max(max, s.position), -1) + 1
      return unwrap(
        await supabase
          .from('note_sections')
          .insert({ name, position, parent_id: parentId, color: color ?? COLORS[sections.length % COLORS.length] })
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
    mutationFn: async (id: string) => {
      // La carpeta se lleva sus subcarpetas y notas; sus PDFs hay que quitarlos de Storage a mano.
      const sections = qc.getQueryData<NoteSection[]>(['sections']) ?? []
      const ids = new Set([id])
      for (let grew = true; grew; ) {
        grew = false
        for (const s of sections) if (s.parent_id && ids.has(s.parent_id) && !ids.has(s.id)) (ids.add(s.id), (grew = true))
      }
      const cleanUp = await removePdfs({ sectionIds: [...ids] })
      unwrap(await supabase.from('note_sections').delete().eq('id', id))
      await cleanUp()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sections'] })
      qc.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export type NoteSummary = Omit<Note, 'content' | 'drawing'> & { paper: PaperStyle | null; pdf: string | null }

export function useNotes(sectionId: string | undefined, search: string) {
  const term = search.trim().replace(/[,()%*]/g, ' ')
  return useQuery({
    queryKey: ['notes', 'list', sectionId, term],
    enabled: !!sectionId,
    queryFn: async () => {
      let query = supabase
        .from('notes')
        .select('id, section_id, title, content_text, pinned, created_at, updated_at, paper:drawing->>paper, pdf:drawing->pdf->>path')
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
    mutationFn: async ({ sectionId, drawing }: { sectionId: string; drawing: NoteDrawing }) =>
      unwrap(await supabase.from('notes').insert({ section_id: sectionId, drawing }).select().single()) as Note,
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
    mutationFn: async (id: string) => {
      const cleanUp = await removePdfs({ noteId: id })
      unwrap(await supabase.from('notes').delete().eq('id', id))
      await cleanUp()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'list'] }),
  })
}

/** Sube un PDF y crea con él un documento: una hoja por página, lista para escribir encima. */
export function useImportPdf() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ sectionId, file }: { sectionId: string; file: File }) => {
      const data = await file.arrayBuffer()
      // Se lee antes de subirlo: si no es un PDF válido, no se sube nada.
      const pdf = await loadPdf(data.slice(0))
      const pages = pdf.numPages
      await pdf.loadingTask.destroy()

      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error('Sesión caducada')
      const path = `${auth.user.id}/${crypto.randomUUID()}.pdf`
      const { error } = await supabase.storage.from(BUCKET).upload(path, data, { contentType: 'application/pdf' })
      if (error) throw new Error(error.message)

      const drawing: NoteDrawing = {
        ...EMPTY_DRAWING,
        mode: 'hand',
        paper: 'plain',
        pages,
        pdf: { path, sheets: Array.from({ length: pages }, (_, i) => i + 1) },
      }
      const title = file.name.replace(/\.pdf$/i, '')
      try {
        return unwrap(await supabase.from('notes').insert({ section_id: sectionId, title, drawing }).select().single()) as Note
      } catch (err) {
        await supabase.storage.from(BUCKET).remove([path])
        throw err
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'list'] }),
  })
}

/** Descarga y abre el PDF de un documento; se guarda en memoria mientras se usa. */
export function usePdf(path: string | undefined) {
  return useQuery({
    queryKey: ['pdf', path],
    enabled: !!path,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).download(path!)
      if (error) throw new Error(error.message)
      return loadPdf(await data.arrayBuffer())
    },
  })
}
