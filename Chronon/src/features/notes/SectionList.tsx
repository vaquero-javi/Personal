import { useState, type FormEvent } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { Button, ColorPicker, Empty, IconButton, Skeleton, inputClass } from '../../components/ui'
import type { NoteSection } from '../../lib/types'
import { useCreateSection, useDeleteSection, useSections, useUpdateSections } from './api'

export function SectionList({ activeId }: { activeId?: string }) {
  const { data: sections = [], isLoading } = useSections()
  const create = useCreateSection()
  const update = useUpdateSections()
  const navigate = useNavigate()
  const [newName, setNewName] = useState('')

  function move(index: number, dir: -1 | 1) {
    const order = [...sections]
    const [item] = order.splice(index, 1)
    order.splice(index + dir, 0, item)
    update.mutate(order.flatMap((s, position) => (s.position === position ? [] : [{ id: s.id, position }])))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const section = await create.mutateAsync(name)
    setNewName('')
    navigate(`/notes/${section.id}`)
  }

  return (
    <div className="space-y-2">
      <h2 className="px-2 text-[13px] font-medium text-ink-500">Secciones</h2>
      {isLoading ? (
        <Skeleton rows={3} />
      ) : sections.length === 0 ? (
        <Empty icon="folder">Crea tu primera sección: Trabajo, Ideas, Clientes…</Empty>
      ) : (
        <ul className="space-y-0.5">
          {sections.map((s, i) => (
            <SectionItem
              key={s.id}
              section={s}
              active={s.id === activeId}
              onMoveUp={i > 0 ? () => move(i, -1) : undefined}
              onMoveDown={i < sections.length - 1 ? () => move(i, 1) : undefined}
            />
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex gap-1.5 pt-1">
        <input
          className={`${inputClass} border-dashed bg-transparent`}
          placeholder="+ Nueva sección"
          aria-label="Nueva sección"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        {newName.trim() && (
          <Button disabled={create.isPending}>Crear</Button>
        )}
      </form>
    </div>
  )
}

interface ItemProps {
  section: NoteSection
  active: boolean
  onMoveUp?: () => void
  onMoveDown?: () => void
}

function SectionItem({ section, active, onMoveUp, onMoveDown }: ItemProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(section.name)
  const update = useUpdateSections()
  const del = useDeleteSection()
  const navigate = useNavigate()

  if (editing) {
    return (
      <li className="space-y-3 rounded-xl bg-surface p-3 shadow-soft ring-1 ring-ink-200/70">
        <input className={inputClass} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <ColorPicker value={section.color} onChange={(color) => update.mutate([{ id: section.id, color }])} />
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" onClick={() => { if (name.trim()) update.mutate([{ id: section.id, name: name.trim() }]); setEditing(false) }}>
            Guardar
          </Button>
          <IconButton icon="up" label="Subir" className="size-8 disabled:opacity-30" disabled={!onMoveUp} onClick={onMoveUp} />
          <IconButton icon="down" label="Bajar" className="size-8 disabled:opacity-30" disabled={!onMoveDown} onClick={onMoveDown} />
          <IconButton
            icon="trash"
            label="Borrar sección"
            className="ml-auto size-8 hover:bg-red-50! hover:text-red-600!"
            onClick={async () => {
              if (!confirm(`¿Borrar la sección "${section.name}" y todas sus notas?`)) return
              await del.mutateAsync(section.id)
              if (active) navigate('/notes')
            }}
          />
        </div>
      </li>
    )
  }

  return (
    <li className="group flex items-center">
      <NavLink
        to={`/notes/${section.id}`}
        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors duration-200 ${active ? 'bg-surface font-medium text-ink-900 shadow-soft ring-1 ring-ink-200/70' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'}`}
      >
        <span className="h-5 w-3.5 shrink-0 rounded-[3px] rounded-l-sm shadow-soft" style={{ background: section.color }} aria-hidden />
        <span className="truncate">{section.name}</span>
      </NavLink>
      <IconButton
        icon="more"
        label="Editar sección"
        className="size-8 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        onClick={() => setEditing(true)}
      />
    </li>
  )
}
