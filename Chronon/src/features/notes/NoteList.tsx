import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button, Empty, Skeleton, inputClass } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { NoteSection } from '../../lib/types'
import { useCreateNote, useNotes } from './api'

export function NoteList({ section, activeId }: { section: NoteSection; activeId?: string }) {
  const [search, setSearch] = useState('')
  const { data: notes = [], isLoading } = useNotes(section.id, search)
  const create = useCreateNote()
  const navigate = useNavigate()

  async function newNote() {
    const note = await create.mutateAsync(section.id)
    navigate(`/notes/${section.id}/${note.id}`)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link to="/notes" className="-ml-2 grid size-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 md:hidden" aria-label="Volver">
          <Icon name="back" />
        </Link>
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: section.color }} />
        <h2 className="flex-1 truncate font-display text-2xl leading-none md:text-xl">{section.name}</h2>
        <Button size="sm" onClick={newNote} disabled={create.isPending}>
          <Icon name="plus" size={14} strokeWidth={2} /> Nota
        </Button>
      </div>
      <div className="relative">
        <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input className={`${inputClass} pl-9`} type="search" placeholder="Buscar en esta sección…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {isLoading ? (
        <Skeleton rows={4} />
      ) : notes.length === 0 ? (
        <Empty icon={search ? 'search' : 'notes'}>{search ? 'Nada coincide con la búsqueda.' : 'Aún no hay notas aquí.'}</Empty>
      ) : (
        <ul className="space-y-1">
          {notes.map((n) => (
            <li key={n.id}>
              <NavLink
                to={`/notes/${section.id}/${n.id}`}
                className={`note-card relative block overflow-hidden rounded-r-xl rounded-l-md bg-surface py-3 pl-5 pr-3.5 shadow-soft transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 ${n.id === activeId ? 'ring-1 ring-ink-300' : 'ring-1 ring-ink-200/60'}`}
              >
                <span className="absolute inset-y-0 left-0 w-[5px]" style={{ background: section.color }} aria-hidden />
                <div className="flex items-center gap-1.5">
                  {n.pinned && <Icon name="pin" size={13} className="shrink-0 text-accent-500" />}
                  <span className="truncate text-sm font-medium text-ink-900">{n.title || 'Sin título'}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-500">{n.content_text || 'Nota vacía'}</p>
                <p className="mt-1.5 font-mono text-[11px] text-ink-400">
                  {formatDistanceToNow(parseISO(n.updated_at), { addSuffix: true, locale: es })}
                </p>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
