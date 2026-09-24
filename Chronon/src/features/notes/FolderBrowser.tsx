import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Modal } from '../../components/Modal'
import { Button, COLORS, ColorPicker, Field, IconButton, Skeleton, inputClass } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { NoteSection } from '../../lib/types'
import { useCreateNote, useCreateSection, useDeleteSection, useNotes, useSections, useUpdateSections, type NoteSummary } from './api'
import { NewNoteDialog } from './NewNoteDialog'
import type { NoteDrawing } from './drawing'

const stamp = (iso: string) => format(parseISO(iso), "d MMM yyyy, H:mm", { locale: es })

/**
 * Explorador de documentos al estilo GoodNotes: se entra en una carpeta y se ven, en cuadrícula,
 * sus subcarpetas y sus notas. La raíz solo tiene carpetas, porque cada nota vive en una.
 */
export function FolderBrowser({ sectionId }: { sectionId?: string }) {
  const { data: sections = [], isLoading } = useSections()
  const section = sections.find((s) => s.id === sectionId)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [dialog, setDialog] = useState<'folder' | 'note' | null>(null)
  const [editing, setEditing] = useState<NoteSection | null>(null)
  const { data: notes = [], isLoading: loadingNotes } = useNotes(section?.id, search)
  const createNote = useCreateNote()
  const navigate = useNavigate()

  const term = search.trim().toLowerCase()
  const folders = sections.filter((s) => (s.parent_id ?? undefined) === section?.id && s.name.toLowerCase().includes(term))
  const parent = section?.parent_id ?? null

  async function newNote(drawing: NoteDrawing) {
    if (!section) return
    const note = await createNote.mutateAsync({ sectionId: section.id, drawing })
    setDialog(null)
    navigate(`/notes/${section.id}/${note.id}`)
  }

  if (sectionId && !isLoading && !section) {
    return (
      <div className="grid min-h-[50dvh] place-items-center text-center text-sm text-ink-500">
        <div className="space-y-3">
          <p>Esta carpeta ya no existe.</p>
          <Link to="/notes" className="font-medium text-accent-600 hover:underline">Volver a Documentos</Link>
        </div>
      </div>
    )
  }

  const empty = !isLoading && !loadingNotes && folders.length === 0 && notes.length === 0

  return (
    <div className="space-y-6">
      {dialog === 'folder' && <NewFolderDialog parentId={section?.id ?? null} onClose={() => setDialog(null)} />}
      {dialog === 'note' && <NewNoteDialog onClose={() => setDialog(null)} onCreate={newNote} busy={createNote.isPending} />}
      {editing && <FolderDialog section={editing} onClose={() => setEditing(null)} />}

      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div>
          {section && (
            <Link
              to={parent ? `/notes/${parent}` : '/notes'}
              className="grid size-10 place-items-center rounded-full bg-surface text-ink-700 shadow-soft ring-1 ring-ink-200/70 transition-colors hover:bg-ink-100"
              aria-label="Volver"
            >
              <Icon name="back" size={20} />
            </Link>
          )}
        </div>
        <h1 className="truncate text-center font-display text-3xl leading-none tracking-tight text-ink-900 sm:text-4xl">
          {section?.name ?? 'Documentos'}
        </h1>
        <div className="flex items-center justify-end gap-1">
          <IconButton icon="search" label="Buscar" active={searching} onClick={() => { setSearching((v) => !v); setSearch('') }} />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Breadcrumbs sections={sections} section={section} />
        <div className="ml-auto flex items-center gap-2">
          {searching && (
            <input
              className={`${inputClass} h-9 w-48 sm:w-64`}
              type="search"
              autoFocus
              placeholder={section ? 'Buscar en esta carpeta…' : 'Buscar carpeta…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          <NewMenu canCreateNote={!!section} onPick={setDialog} />
        </div>
      </div>

      {isLoading ? (
        <Skeleton rows={3} />
      ) : empty ? (
        <div className="grid min-h-[40dvh] place-items-center text-center">
          <div className="space-y-2 text-ink-400">
            <Icon name={term ? 'search' : 'folder'} size={32} className="mx-auto" />
            <p className="text-sm">
              {term ? 'Nada coincide con la búsqueda.' : section ? 'Carpeta vacía. Pulsa «Nuevo» para crear una nota o una subcarpeta.' : 'Crea tu primera carpeta: Ingeniería, Trabajo, Ideas…'}
            </p>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-4 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
          {folders.map((f) => (
            <li key={f.id}>
              <FolderTile section={f} count={sections.filter((s) => s.parent_id === f.id).length} onOptions={() => setEditing(f)} />
            </li>
          ))}
          {notes.map((n) => (
            <li key={n.id}>
              <NoteTile note={n} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Breadcrumbs({ sections, section }: { sections: NoteSection[]; section?: NoteSection }) {
  const path: NoteSection[] = []
  for (let node = section; node; node = sections.find((s) => s.id === node!.parent_id)) path.unshift(node)
  if (path.length < 2) return null
  return (
    <nav aria-label="Ruta" className="flex min-w-0 flex-wrap items-center text-[13px] text-ink-500">
      <Link to="/notes" className="hover:text-ink-900">Documentos</Link>
      {path.map((s, i) => (
        <span key={s.id} className="flex items-center">
          <span className="px-1.5 text-ink-300">/</span>
          {i === path.length - 1 ? (
            <span className="text-ink-800">{s.name}</span>
          ) : (
            <Link to={`/notes/${s.id}`} className="hover:text-ink-900">{s.name}</Link>
          )}
        </span>
      ))}
    </nav>
  )
}

function NewMenu({ canCreateNote, onPick }: { canCreateNote: boolean; onPick: (kind: 'folder' | 'note') => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (kind: 'folder' | 'note') => {
    setOpen(false)
    onPick(kind)
  }

  return (
    <div ref={ref} className="relative">
      <Button variant="accent" className="rounded-full" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        <Icon name="plus" size={16} strokeWidth={2} /> Nuevo
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-2 w-52 animate-fade overflow-hidden rounded-2xl bg-surface p-1 shadow-float ring-1 ring-ink-200/70">
          {canCreateNote && (
            <button role="menuitem" type="button" onClick={() => pick('note')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink-800 hover:bg-ink-100">
              <Icon name="notes" size={18} className="text-ink-500" /> Nota
            </button>
          )}
          <button role="menuitem" type="button" onClick={() => pick('folder')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink-800 hover:bg-ink-100">
            <Icon name="folder" size={18} className="text-ink-500" /> {canCreateNote ? 'Subcarpeta' : 'Carpeta'}
          </button>
        </div>
      )}
    </div>
  )
}

/** Dibujo de carpeta con pestaña, teñido con el color de la carpeta. */
function FolderArt({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 120 90" className="w-full drop-shadow-sm" aria-hidden>
      <path d="M6 14a8 8 0 0 1 8-8h30l10 9h52a8 8 0 0 1 8 8v8H6z" fill={color} opacity={0.55} />
      <rect x="6" y="22" width="108" height="62" rx="8" fill={color} />
      <rect x="6" y="22" width="108" height="62" rx="8" fill="url(#folder-shine)" />
      <defs>
        <linearGradient id="folder-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.18} />
          <stop offset="1" stopColor="#000" stopOpacity={0.08} />
        </linearGradient>
      </defs>
    </svg>
  )
}

function FolderTile({ section, count, onOptions }: { section: NoteSection; count: number; onOptions: () => void }) {
  return (
    <div className="group relative">
      <Link to={`/notes/${section.id}`} className="block rounded-2xl p-1.5 text-center transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-accent-400">
        <div className="relative mx-auto max-w-[9.5rem]">
          <FolderArt color={section.color} />
          {count > 0 && (
            <span className="absolute bottom-[14%] right-[10%] rounded-full bg-black/20 px-1.5 font-mono text-[10px] text-white">{count}</span>
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-sm font-semibold leading-tight text-ink-900">{section.name}</p>
        <p className="mt-0.5 text-[11px] text-ink-400">{stamp(section.created_at)}</p>
      </Link>
      <IconButton
        icon="more"
        label={`Opciones de ${section.name}`}
        className="absolute right-1 top-1 size-8 bg-surface/80 shadow-soft backdrop-blur md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        onClick={onOptions}
      />
    </div>
  )
}

function NoteTile({ note }: { note: NoteSummary }) {
  return (
    <Link
      to={`/notes/${note.section_id}/${note.id}`}
      className="group block rounded-2xl p-1.5 text-center transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-accent-400"
    >
      <div
        className={`paper paper-${note.paper ?? 'ruled'} relative mx-auto aspect-[1/1.414] max-w-[7.5rem] overflow-hidden rounded-md text-left shadow-soft ring-1 ring-ink-200/80`}
        style={{ ['--paper-cell' as string]: '9px', ['--paper-gutter' as string]: '14px' }}
      >
        <p className="line-clamp-[9] break-words px-2.5 pt-2 text-[6px] leading-[9px] text-ink-600">{note.content_text}</p>
        {note.pinned && <Icon name="pin" size={13} className="absolute right-1.5 top-1.5 text-accent-500" />}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-tight text-ink-900">{note.title || 'Sin título'}</p>
      <p className="mt-0.5 text-[11px] text-ink-400">{stamp(note.updated_at)}</p>
    </Link>
  )
}

function NewFolderDialog({ parentId, onClose }: { parentId: string | null; onClose: () => void }) {
  const create = useCreateSection()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await create.mutateAsync({ name: name.trim(), parentId, color })
    onClose()
    navigate(parentId ? `/notes/${parentId}` : '/notes')
  }

  return (
    <Modal title={parentId ? 'Nueva subcarpeta' : 'Nueva carpeta'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Nombre">
          <input className={inputClass} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Lógica, TIC…" />
        </Field>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!name.trim() || create.isPending}>{create.isPending ? 'Creando…' : 'Crear carpeta'}</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Renombrar, cambiar de color, mover o borrar una carpeta. */
function FolderDialog({ section, onClose }: { section: NoteSection; onClose: () => void }) {
  const { data: sections = [] } = useSections()
  const update = useUpdateSections()
  const del = useDeleteSection()
  const [name, setName] = useState(section.name)
  const [color, setColor] = useState(section.color)
  const [parentId, setParentId] = useState(section.parent_id ?? '')

  // No se puede meter una carpeta dentro de sí misma ni de sus subcarpetas.
  const blocked = new Set([section.id])
  for (let grew = true; grew; ) {
    grew = false
    for (const s of sections) if (s.parent_id && blocked.has(s.parent_id) && !blocked.has(s.id)) (blocked.add(s.id), (grew = true))
  }
  const targets = sections.filter((s) => !blocked.has(s.id))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await update.mutateAsync([{ id: section.id, name: name.trim(), color, parent_id: parentId || null }])
    onClose()
  }

  async function remove() {
    if (!confirm(`¿Borrar la carpeta "${section.name}", sus subcarpetas y todas sus notas?`)) return
    await del.mutateAsync(section.id)
    onClose()
  }

  return (
    <Modal title="Carpeta" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Nombre">
          <input className={inputClass} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label="Dentro de">
          <select className={inputClass} value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Documentos (raíz)</option>
            {targets.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-center gap-2 border-t border-ink-100 pt-4">
          <Button type="button" variant="danger" onClick={remove} disabled={del.isPending}>
            <Icon name="trash" size={15} /> Borrar
          </Button>
          <Button type="button" variant="secondary" className="ml-auto" onClick={onClose}>Cancelar</Button>
          <Button disabled={!name.trim() || update.isPending}>Guardar</Button>
        </div>
      </form>
    </Modal>
  )
}
