/** Estudio con IA: llamadas a la Edge Function `study-ai` y lo que se guarda de cada documento. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from '../../lib/supabase'
import { PAGE_WIDTH, SHEET_HEIGHT, paintAll, type NoteDrawing, type Stroke } from './drawing'
import type { PDFDocumentProxy } from './pdf'

export type StudyKind = 'summary' | 'exam' | 'cards'

export interface ExamQuestion {
  kind: 'test' | 'open'
  question: string
  options: string[]
  /** Índice de la opción correcta; -1 en las preguntas abiertas. */
  correct: number
  answer: string
  source: string
}

export interface Flashcard {
  front: string
  back: string
}

export type StudyContent = { markdown: string } | { questions: ExamQuestion[] } | { cards: Flashcard[] }

export interface StudyItem<C extends StudyContent = StudyContent> {
  id: string
  note_id: string
  kind: StudyKind
  title: string
  content: C
  created_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function useStudyItems(noteId: string, kind: StudyKind) {
  return useQuery({
    queryKey: ['study', noteId, kind],
    queryFn: async () =>
      unwrap(
        await supabase.from('study_items').select('*').eq('note_id', noteId).eq('kind', kind).order('created_at', { ascending: false }),
      ) as StudyItem[],
  })
}

export function useSaveStudyItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: Pick<StudyItem, 'note_id' | 'kind' | 'title' | 'content'>) =>
      unwrap(await supabase.from('study_items').insert(item).select().single()) as StudyItem,
    onSuccess: (item) => qc.invalidateQueries({ queryKey: ['study', item.note_id, item.kind] }),
  })
}

export function useDeleteStudyItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: StudyItem) => unwrap(await supabase.from('study_items').delete().eq('id', item.id)),
    onSuccess: (_d, item) => qc.invalidateQueries({ queryKey: ['study', item.note_id, item.kind] }),
  })
}

export interface StudySource {
  noteId: string
  text: string
  sheets: { number: number; data: string }[]
}

interface StudyRequest extends StudySource {
  action: 'chat' | StudyKind
  messages?: ChatMessage[]
  count?: number
}

/** Llama a la IA y va pasando el texto según llega. Devuelve la respuesta completa. */
export async function askStudyAi(request: StudyRequest, onText: (sofar: string) => void, signal?: AbortSignal) {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/study-ai`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal,
  })
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? (res.status === 404 ? 'La función de IA no está desplegada en Supabase.' : `Error ${res.status}`))
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let text = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as { t: 'text' | 'done' | 'error'; v?: string }
      if (event.t === 'text') {
        text += event.v ?? ''
        onText(text)
      } else if (event.t === 'error') {
        throw new Error(event.v)
      }
    }
  }
  return text
}

/** Tope de hojas a mano por petición, para que la petición no pase de lo que acepta Gemini de una vez. */
const MAX_SHEETS = 80
/** Ancho en píxeles con el que la IA ve cada hoja: suficiente para leer letra a mano. */
const SHOT_WIDTH = 1100

const sheetOf = (stroke: Stroke) => Math.floor(stroke.points[0][1] / SHEET_HEIGHT)

/**
 * Fotografía las hojas que tienen algo escrito a mano (con su página del PDF debajo, si la hay)
 * para que la IA pueda leerlas. Las hojas sin trazos no se mandan: su texto ya va aparte.
 */
export async function photographSheets(drawing: NoteDrawing, pdf: PDFDocumentProxy | undefined, pdfPages: (number | null)[] | null) {
  const byPage = new Map<number, Stroke[]>()
  for (const stroke of drawing.strokes) {
    const at = sheetOf(stroke)
    byPage.set(at, [...(byPage.get(at) ?? []), stroke])
  }
  const indexes = [...byPage.keys()].sort((a, b) => a - b).slice(0, MAX_SHEETS)
  const scale = SHOT_WIDTH / PAGE_WIDTH
  const shots: StudySource['sheets'] = []

  for (const index of indexes) {
    const canvas = document.createElement('canvas')
    canvas.width = SHOT_WIDTH
    canvas.height = Math.round(SHEET_HEIGHT * scale)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const pdfPage = pdfPages?.[index]
    if (pdf && pdfPage && pdfPage <= pdf.numPages) {
      const page = await pdf.getPage(pdfPage)
      const base = page.getViewport({ scale: 1 })
      const fit = Math.min(canvas.width / base.width, canvas.height / base.height)
      const viewport = page.getViewport({ scale: fit, offsetX: (canvas.width - base.width * fit) / 2 })
      await page.render({ canvas, viewport }).promise
    }

    ctx.save()
    ctx.translate(0, -index * SHEET_HEIGHT * scale)
    paintAll(ctx, byPage.get(index)!, scale)
    ctx.restore()
    shots.push({ number: index + 1, data: canvas.toDataURL('image/jpeg', 0.82).split(',')[1] })
  }
  return shots
}
