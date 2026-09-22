import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { Empty, IconButton, Skeleton } from '../../components/ui'
import { Icon, type IconName } from '../../components/Icon'
import type { Note } from '../../lib/types'
import { useIsDark } from '../../lib/theme'
import { useDeleteNote, useNote, useSections, useUpdateNote } from './api'
import { DrawingLayer } from './DrawingLayer'
import {
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_SIZES,
  PAGE_WIDTH,
  PEN_COLORS,
  PEN_SIZES,
  displayColor,
  parseDrawing,
  type NoteDrawing,
  type PaperStyle,
  type Stroke,
  type Tool,
} from './drawing'

const SAVE_DELAY = 700
/** Alto mínimo de la hoja, en unidades de página. */
const MIN_PAGE_HEIGHT = 1120

export function NoteEditor({ noteId }: { noteId: string }) {
  const { data: note, isLoading, error } = useNote(noteId)
  if (isLoading)
    return (
      <div className="rounded-2xl bg-surface p-6 shadow-soft ring-1 ring-ink-200/70">
        <Skeleton rows={5} />
      </div>
    )
  if (error || !note) return <Empty icon="notes">Esta nota ya no existe.</Empty>
  return <LoadedEditor note={note} />
}

/** Ancho real de la hoja en pantalla, para colocar el papel y los trazos a la misma escala. */
function usePageScale(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(PAGE_WIDTH)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || PAGE_WIDTH))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width / PAGE_WIDTH
}

function LoadedEditor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title)
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [drawing, setDrawing] = useState<NoteDrawing>(() => parseDrawing(note.drawing))
  // La nota recuerda si se creó para escribir a mano o a teclado, y abre con esa herramienta.
  const [tool, setTool] = useState<Tool>(() => (parseDrawing(note.drawing).mode === 'hand' ? 'pen' : 'text'))
  const [pen, setPen] = useState({ color: PEN_COLORS[0], size: PEN_SIZES[1] })
  const [highlighter, setHighlighter] = useState({ color: HIGHLIGHTER_COLORS[0], size: HIGHLIGHTER_SIZES[1] })
  const [fingerDraws, setFingerDraws] = useState(false)
  const update = useUpdateNote()
  const del = useDeleteNote()
  const { data: sections = [] } = useSections()
  const navigate = useNavigate()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef(false)
  const titleRef = useRef(title)
  titleRef.current = title
  const drawingRef = useRef(drawing)
  drawingRef.current = drawing
  const undoStack = useRef<Stroke[][]>([])
  const redoStack = useRef<Stroke[][]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const scale = usePageScale(pageRef)

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Escribe aquí… (usa [ ] para una lista de tareas)' }),
    ],
    content: (note.content as object | null) ?? '',
    onUpdate: () => scheduleSave(),
  })

  const save = useCallback(async () => {
    if (!editor || !pending.current) return
    pending.current = false
    setStatus('saving')
    try {
      await update.mutateAsync({
        id: note.id,
        title: titleRef.current.trim(),
        content: editor.getJSON(),
        content_text: editor.getText({ blockSeparator: ' ' }).slice(0, 5000),
        drawing: drawingRef.current,
      })
      setStatus(pending.current ? 'dirty' : 'saved')
    } catch {
      pending.current = true
      setStatus('error')
    }
  }, [editor, note.id, update])

  const saveRef = useRef(save)
  saveRef.current = save

  function scheduleSave() {
    pending.current = true
    setStatus('dirty')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => saveRef.current(), SAVE_DELAY)
  }

  // Guardar lo pendiente al salir de la nota.
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      saveRef.current()
    },
    [],
  )

  function setStrokes(next: Stroke[], remember = true) {
    if (remember) {
      undoStack.current.push(drawingRef.current.strokes)
      redoStack.current = []
    }
    setDrawing((d) => ({ ...d, strokes: next }))
    scheduleSave()
  }

  function undo() {
    const previous = undoStack.current.pop()
    if (!previous) return
    redoStack.current.push(drawingRef.current.strokes)
    setStrokes(previous, false)
  }

  function redo() {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(drawingRef.current.strokes)
    setStrokes(next, false)
  }

  function setPaper(paper: PaperStyle) {
    setDrawing((d) => ({ ...d, paper }))
    scheduleSave()
  }

  async function remove() {
    if (!confirm('¿Borrar esta nota?')) return
    pending.current = false
    clearTimeout(timer.current)
    await del.mutateAsync(note.id)
    navigate(`/notes/${note.section_id}`)
  }

  // La hoja crece si se escribe a mano cerca del final.
  const pageHeight = useMemo(() => {
    let lowest = 0
    for (const stroke of drawing.strokes) for (const [, y] of stroke.points) if (y > lowest) lowest = y
    return Math.max(MIN_PAGE_HEIGHT, Math.ceil((lowest + 400) / 400) * 400)
  }, [drawing.strokes])

  const statusLabel = { saved: 'Guardado', dirty: 'Sin guardar…', saving: 'Guardando…', error: 'Error al guardar' }[status]
  const statusDot = { saved: 'bg-emerald-500', dirty: 'bg-ink-300', saving: 'bg-accent-500 animate-shimmer', error: 'bg-red-500' }[status]

  return (
    <article className="flex h-[80dvh] flex-col overflow-hidden rounded-2xl bg-surface shadow-soft ring-1 ring-ink-200/70 md:h-[calc(100dvh-6.5rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-3 py-2 sm:px-4">
        <Link to={`/notes/${note.section_id}`} className="grid size-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 md:hidden" aria-label="Volver">
          <Icon name="back" />
        </Link>
        <span className={`flex items-center gap-1.5 text-xs ${status === 'error' ? 'text-red-600' : 'text-ink-400'}`} aria-live="polite">
          <span className={`size-1.5 rounded-full ${statusDot}`} />
          {statusLabel}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <div className="relative">
            <select
              className="h-8 appearance-none rounded-lg bg-transparent pl-2.5 pr-7 text-xs text-ink-600 ring-1 ring-inset ring-ink-200 transition-colors hover:text-ink-900"
              value={note.section_id}
              onChange={async (e) => {
                await update.mutateAsync({ id: note.id, section_id: e.target.value })
                navigate(`/notes/${e.target.value}/${note.id}`, { replace: true })
              }}
              aria-label="Mover a sección"
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <Icon name="chevronDown" size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-400" />
          </div>
          <IconButton
            icon="pin"
            label={note.pinned ? 'Desfijar' : 'Fijar arriba'}
            active={note.pinned}
            className="size-8"
            onClick={() => update.mutate({ id: note.id, pinned: !note.pinned })}
          />
          <IconButton icon="trash" label="Borrar nota" className="size-8 hover:bg-red-50! hover:text-red-600!" onClick={remove} />
        </div>
      </div>

      <Toolbar
        editor={editor}
        tool={tool}
        onTool={setTool}
        pen={pen}
        onPen={setPen}
        highlighter={highlighter}
        onHighlighter={setHighlighter}
        paper={drawing.paper}
        onPaper={setPaper}
        fingerDraws={fingerDraws}
        onFingerDraws={setFingerDraws}
        onUndo={undo}
        onRedo={redo}
        hasStrokes={drawing.strokes.length > 0}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain bg-ink-100 p-2 sm:p-5">
        <div
          ref={pageRef}
          className={`paper paper-${drawing.paper} relative mx-auto w-full max-w-[1180px] overflow-hidden rounded-xl bg-surface shadow-soft`}
          style={{ minHeight: pageHeight * scale, ['--page-scale' as string]: scale }}
        >
          <div className="px-6 pb-16 pt-8 sm:px-14">
            <input
              className="w-full bg-transparent font-display text-4xl leading-tight tracking-tight text-ink-900 outline-none placeholder:text-ink-300"
              placeholder="Sin título"
              aria-label="Título"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                scheduleSave()
              }}
            />
            <EditorContent
              editor={editor}
              className="mt-4 cursor-text"
              onClick={() => tool === 'text' && editor?.commands.focus()}
            />
          </div>
          <DrawingLayer
            strokes={drawing.strokes}
            onChange={setStrokes}
            tool={tool}
            color={tool === 'highlighter' ? highlighter.color : pen.color}
            size={tool === 'highlighter' ? highlighter.size : pen.size}
            fingerDraws={fingerDraws}
            scrollRef={scrollRef}
          />
        </div>
      </div>
    </article>
  )
}

const TOOLS: { value: Tool; icon: IconName; label: string }[] = [
  { value: 'text', icon: 'text', label: 'Texto' },
  { value: 'pen', icon: 'pen', label: 'Lápiz' },
  { value: 'highlighter', icon: 'highlighter', label: 'Marcador' },
  { value: 'eraser', icon: 'eraser', label: 'Goma' },
]

const PAPERS: { value: PaperStyle; label: string }[] = [
  { value: 'ruled', label: 'Rayado' },
  { value: 'grid', label: 'Cuadrícula' },
  { value: 'dots', label: 'Puntos' },
  { value: 'plain', label: 'Liso' },
]

interface ToolbarProps {
  editor: Editor | null
  tool: Tool
  onTool: (t: Tool) => void
  pen: { color: string; size: number }
  onPen: (p: { color: string; size: number }) => void
  highlighter: { color: string; size: number }
  onHighlighter: (p: { color: string; size: number }) => void
  paper: PaperStyle
  onPaper: (p: PaperStyle) => void
  fingerDraws: boolean
  onFingerDraws: (v: boolean) => void
  onUndo: () => void
  onRedo: () => void
  hasStrokes: boolean
}

function Toolbar(props: ToolbarProps) {
  const { editor, tool, onTool, paper, onPaper, fingerDraws, onFingerDraws, onUndo, onRedo, hasStrokes } = props
  const dark = useIsDark()
  const drawingTool = tool === 'pen' || tool === 'highlighter'
  const current = tool === 'highlighter' ? props.highlighter : props.pen
  const setCurrent = tool === 'highlighter' ? props.onHighlighter : props.onPen
  const colors = tool === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS
  const sizes = tool === 'highlighter' ? HIGHLIGHTER_SIZES : PEN_SIZES

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-ink-100 px-2 py-2 sm:px-3">
      <div className="flex rounded-xl bg-ink-100 p-0.5">
        {TOOLS.map((t) => (
          <button
            key={t.value}
            type="button"
            title={t.label}
            aria-label={t.label}
            aria-pressed={tool === t.value}
            onClick={() => onTool(t.value)}
            className={`grid size-8 place-items-center rounded-[10px] transition-[background-color,color,box-shadow] duration-200 ${tool === t.value ? 'bg-surface text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-900'}`}
          >
            <Icon name={t.icon} size={17} />
          </button>
        ))}
      </div>

      {drawingTool && (
        <>
          <div className="flex items-center gap-1">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={current.color === c}
                onClick={() => setCurrent({ ...current, color: c })}
                className={`size-6 rounded-full transition-transform duration-200 hover:scale-110 ${current.color === c ? 'ring-2 ring-ink-900 ring-offset-2 ring-offset-surface' : ''}`}
                style={{ background: displayColor(c, dark) }}
              />
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Grosor ${s}`}
                aria-pressed={current.size === s}
                onClick={() => setCurrent({ ...current, size: s })}
                className={`grid size-8 place-items-center rounded-lg transition-colors duration-200 ${current.size === s ? 'bg-ink-100' : 'hover:bg-ink-50'}`}
              >
                <span className="rounded-full bg-ink-800" style={{ width: 4 + s / 1.6, height: 4 + s / 1.6 }} />
              </button>
            ))}
          </div>
        </>
      )}

      {tool === 'text' && editor && <TextTools editor={editor} />}

      <div className="ml-auto flex items-center gap-0.5">
        {(drawingTool || tool === 'eraser') && (
          <button
            type="button"
            onClick={() => onFingerDraws(!fingerDraws)}
            aria-pressed={fingerDraws}
            title={fingerDraws ? 'El dedo pinta' : 'El dedo desplaza la hoja'}
            className={`hidden h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] transition-colors duration-200 sm:flex ${fingerDraws ? 'bg-ink-900 text-ink-50' : 'text-ink-500 ring-1 ring-inset ring-ink-200'}`}
          >
            <Icon name="hand" size={14} />
            {fingerDraws ? 'Dedo pinta' : 'Dedo desplaza'}
          </button>
        )}
        <IconButton icon="undo" label="Deshacer" className="size-8" onClick={onUndo} disabled={!hasStrokes && tool !== 'text'} />
        <IconButton icon="redo" label="Rehacer" className="size-8" onClick={onRedo} />
        <div className="relative">
          <select
            className="h-8 appearance-none rounded-lg bg-transparent pl-2.5 pr-7 text-xs text-ink-600 ring-1 ring-inset ring-ink-200 transition-colors hover:text-ink-900"
            value={paper}
            onChange={(e) => onPaper(e.target.value as PaperStyle)}
            aria-label="Tipo de papel"
          >
            {PAPERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <Icon name="chevronDown" size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-400" />
        </div>
      </div>
    </div>
  )
}

function TextTools({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      code: e.isActive('codeBlock'),
    }),
  })

  const chain = () => editor.chain().focus()
  const buttons: { key: keyof typeof state; label: string; title: string; run: () => void }[] = [
    { key: 'bold', label: 'B', title: 'Negrita', run: () => chain().toggleBold().run() },
    { key: 'italic', label: 'I', title: 'Cursiva', run: () => chain().toggleItalic().run() },
    { key: 'strike', label: 'S̶', title: 'Tachado', run: () => chain().toggleStrike().run() },
    { key: 'h1', label: 'H1', title: 'Título', run: () => chain().toggleHeading({ level: 1 }).run() },
    { key: 'h2', label: 'H2', title: 'Subtítulo', run: () => chain().toggleHeading({ level: 2 }).run() },
    { key: 'bullet', label: '•', title: 'Lista', run: () => chain().toggleBulletList().run() },
    { key: 'ordered', label: '1.', title: 'Lista numerada', run: () => chain().toggleOrderedList().run() },
    { key: 'task', label: '☑', title: 'Lista de tareas', run: () => chain().toggleTaskList().run() },
    { key: 'quote', label: '❝', title: 'Cita', run: () => chain().toggleBlockquote().run() },
    { key: 'code', label: '</>', title: 'Código', run: () => chain().toggleCodeBlock().run() },
  ]

  return (
    <div className="flex flex-wrap gap-0.5">
      {buttons.map((b) => (
        <button
          key={b.key}
          type="button"
          title={b.title}
          onClick={b.run}
          aria-pressed={state[b.key]}
          className={`h-8 min-w-8 rounded-lg px-2 text-[13px] transition-colors duration-150 ${state[b.key] ? 'bg-ink-900 text-ink-50' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900'} ${b.key === 'bold' ? 'font-bold' : ''} ${b.key === 'italic' ? 'font-display text-base italic' : ''} ${['h1', 'h2', 'ordered', 'code'].includes(b.key) ? 'font-mono text-xs' : ''}`}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}
