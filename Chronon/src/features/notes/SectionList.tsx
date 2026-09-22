import { useState, type FormEvent } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { Button, ColorPicker, Empty, IconButton, Skeleton, inputClass } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { NoteSection } from '../../lib/types'
import { useCreateSection, useDeleteSection, useSections, useUpdateSections } from './api'

/** Árbol de carpetas: cada carpeta puede contener subcarpetas y notas. */
export function SectionList({ activeId }: { activeId?: string }) {
  const { data: sections = [], isLoading } = useSections()
  const create = useCreateSection()
  const navigate = useNavigate()
  const [newName, setNewName] = useState('')
  const [newParent, setNewParent] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const childrenOf = (parentId: string | null) => sections.filter((s) => (s.parent_id ?? null) === parentId)

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const section = await create.mutateAsync({ name, parentId: newParent })
    setNewName('')
    setNewParent(null)
    navigate(`/notes/${section.id}`)
  }

  function renderLevel(parentId: string | null, depth: number) {
    const items = childrenOf(parentId)
    return items.map((section, i) => {
      const kids = childrenOf(section.id)
      const isCollapsed = collapsed.has(section.id)
      return (
        <li key={section.id}>
          <FolderRow
            section={section}
            depth={depth}
            active={section.id === activeId}
            hasChildren={kids.length > 0}
            collapsed={isCollapsed}
            onToggle={() => toggle(section.id)}
            onAddChild={() => {
              setNewParent(section.id)
              setCollapsed((prev) => {
                const next = new Set(prev)
                next.delete(section.id)
                return next
              })
            }}
            onMoveUp={i > 0 ? () => move(items, i, -1) : undefined}
            onMoveDown={i < items.length - 1 ? () => move(items, i, 1) : undefined}
          />
          {newParent === section.id && (
            <NewFolderForm
              depth={depth + 1}
              value={newName}
              onChange={setNewName}
              onSubmit={submit}
              onCancel={() => {
                setNewParent(null)
                setNewName('')
              }}
              busy={create.isPending}
            />
          )}
          {kids.length > 0 && !isCollapsed && <ul className="space-y-0.5">{renderLevel(section.id, depth + 1)}</ul>}
        </li>
      )
    })
  }

  const update = useUpdateSections()
  function move(siblings: NoteSection[], index: number, dir: -1 | 1) {
    const order = [...siblings]
    const [item] = order.splice(index, 1)
    order.splice(index + dir, 0, item)
    update.mutate(order.flatMap((s, position) => (s.position === position ? [] : [{ id: s.id, position }])))
  }

  return (
    <div className="space-y-2">
      <h2 className="px-2 text-[13px] font-medium text-ink-500">Carpetas</h2>
      {isLoading ? (
        <Skeleton rows={3} />
      ) : sections.length === 0 ? (
        <Empty icon="folder">Crea tu primera carpeta: Trabajo, Ideas, Clientes…</Empty>
      ) : (
        <ul className="space-y-0.5">{renderLevel(null, 0)}</ul>
      )}

      {newParent === null && (
        <NewFolderForm depth={0} value={newName} onChange={setNewName} onSubmit={submit} busy={create.isPending} />
      )}
    </div>
  )
}

function NewFolderForm({
  depth,
  value,
  onChange,
  onSubmit,
  onCancel,
  busy,
}: {
  depth: number
  value: string
  onChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  onCancel?: () => void
  busy: boolean
}) {
  return (
    <form onSubmit={onSubmit} className="flex gap-1.5 pt-1" style={{ paddingLeft: depth * 14 }}>
      <input
        className={`${inputClass} h-9 border-dashed bg-transparent text-[13px]`}
        placeholder={depth ? '+ Subcarpeta' : '+ Nueva carpeta'}
        aria-label={depth ? 'Nueva subcarpeta' : 'Nueva carpeta'}
        autoFocus={depth > 0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel?.()}
      />
      {value.trim() && (
        <Button size="sm" disabled={busy}>
          Crear
        </Button>
      )}
    </form>
  )
}

interface RowProps {
  section: NoteSection
  depth: number
  active: boolean
  hasChildren: boolean
  collapsed: boolean
  onToggle: () => void
  onAddChild: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}

function FolderRow({ section, depth, active, hasChildren, collapsed, onToggle, onAddChild, onMoveUp, onMoveDown }: RowProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(section.name)
  const update = useUpdateSections()
  const del = useDeleteSection()
  const navigate = useNavigate()

  if (editing) {
    return (
      <div className="space-y-3 rounded-xl bg-surface p-3 shadow-soft ring-1 ring-ink-200/70" style={{ marginLeft: depth * 14 }}>
        <input className={inputClass} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <ColorPicker value={section.color} onChange={(color) => update.mutate([{ id: section.id, color }])} />
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            onClick={() => {
              if (name.trim()) update.mutate([{ id: section.id, name: name.trim() }])
              setEditing(false)
            }}
          >
            Guardar
          </Button>
          <IconButton icon="folder" label="Nueva subcarpeta" className="size-8" onClick={() => { onAddChild(); setEditing(false) }} />
          <IconButton icon="up" label="Subir" className="size-8" disabled={!onMoveUp} onClick={onMoveUp} />
          <IconButton icon="down" label="Bajar" className="size-8" disabled={!onMoveDown} onClick={onMoveDown} />
          <IconButton
            icon="trash"
            label="Borrar carpeta"
            className="ml-auto size-8 hover:bg-red-50! hover:text-red-600!"
            onClick={async () => {
              if (!confirm(`¿Borrar la carpeta "${section.name}", sus subcarpetas y todas sus notas?`)) return
              await del.mutateAsync(section.id)
              if (active) navigate('/notes')
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="group flex items-center" style={{ paddingLeft: depth * 14 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Desplegar' : 'Plegar'}
        aria-expanded={!collapsed}
        className={`grid size-5 shrink-0 place-items-center rounded text-ink-400 transition-transform duration-200 hover:text-ink-700 ${collapsed ? '-rotate-90' : ''} ${hasChildren ? '' : 'invisible'}`}
      >
        <Icon name="chevronDown" size={14} />
      </button>
      <NavLink
        to={`/notes/${section.id}`}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-sm transition-colors duration-200 ${active ? 'bg-surface font-medium text-ink-900 shadow-soft ring-1 ring-ink-200/70' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'}`}
      >
        <span className="h-5 w-3.5 shrink-0 rounded-[3px] rounded-l-sm shadow-soft" style={{ background: section.color }} aria-hidden />
        <span className="truncate">{section.name}</span>
      </NavLink>
      <IconButton
        icon="more"
        label={`Opciones de ${section.name}`}
        className="size-8 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        onClick={() => setEditing(true)}
      />
    </div>
  )
}
