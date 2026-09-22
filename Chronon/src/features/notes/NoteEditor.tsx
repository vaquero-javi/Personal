import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { Empty, IconButton, Skeleton } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { Note } from '../../lib/types'
import { useDeleteNote, useNote, useSections, useUpdateNote } from './api'

const SAVE_DELAY = 700

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

function LoadedEditor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title)
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const update = useUpdateNote()
  const del = useDeleteNote()
  const { data: sections = [] } = useSections()
  const navigate = useNavigate()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef(false)
  const titleRef = useRef(title)
  titleRef.current = title

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

  async function remove() {
    if (!confirm('¿Borrar esta nota?')) return
    pending.current = false
    clearTimeout(timer.current)
    await del.mutateAsync(note.id)
    navigate(`/notes/${note.section_id}`)
  }

  const statusLabel = { saved: 'Guardado', dirty: 'Sin guardar…', saving: 'Guardando…', error: 'Error al guardar' }[status]

  const statusDot = { saved: 'bg-emerald-500', dirty: 'bg-ink-300', saving: 'bg-accent-500 animate-shimmer', error: 'bg-red-500' }[status]

  return (
    <article className="flex min-h-[70dvh] flex-col rounded-2xl bg-surface shadow-soft ring-1 ring-ink-200/70">
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
      <div className="flex flex-1 flex-col px-5 sm:px-8">
        <input
          className="mt-6 bg-transparent font-display text-4xl leading-tight tracking-tight text-ink-900 outline-none placeholder:text-ink-300"
          placeholder="Sin título"
          aria-label="Título"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            scheduleSave()
          }}
        />
        {editor && <Toolbar editor={editor} />}
        <EditorContent editor={editor} className="flex-1 cursor-text pb-10" onClick={() => editor?.commands.focus()} />
      </div>
    </article>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
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
    <div className="sticky top-14 z-10 -mx-2 my-3 flex flex-wrap gap-0.5 rounded-xl bg-surface/90 p-1 ring-1 ring-ink-100 backdrop-blur md:top-16">
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
