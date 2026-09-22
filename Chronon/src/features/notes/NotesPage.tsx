import { useState } from 'react'
import { useParams } from 'react-router'
import { Empty, PageHeader } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useSections } from './api'
import { NoteEditor } from './NoteEditor'
import { NoteList } from './NoteList'
import { SectionList } from './SectionList'

export function NotesPage() {
  const { sectionId, noteId } = useParams()
  const { data: sections = [] } = useSections()
  const section = sections.find((s) => s.id === sectionId)
  // Con una nota abierta, la hoja ocupa todo el ancho; las carpetas se muestran a petición.
  const [showLists, setShowLists] = useState(false)
  const focus = Boolean(noteId) && !showLists

  const path: string[] = []
  for (let node = section; node; node = sections.find((s) => s.id === node!.parent_id)) path.unshift(node.name)

  return (
    <div className="space-y-4">
      {noteId ? (
        <div className="hidden items-center gap-3 md:flex">
          <button
            type="button"
            onClick={() => setShowLists((v) => !v)}
            aria-pressed={showLists}
            className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[13px] font-medium transition-colors duration-200 ${showLists ? 'bg-ink-900 text-ink-50' : 'bg-surface text-ink-700 shadow-soft ring-1 ring-ink-200 hover:bg-ink-50'}`}
          >
            <Icon name="folder" size={15} />
            Carpetas
          </button>
          {path.length > 0 && (
            <p className="truncate text-[13px] text-ink-500">
              {path.map((name, i) => (
                <span key={i}>
                  {i > 0 && <span className="px-1.5 text-ink-300">/</span>}
                  {name}
                </span>
              ))}
            </p>
          )}
        </div>
      ) : (
        <PageHeader eyebrow="Ideas, listas y todo lo demás" title="Apuntes" />
      )}

      <div
        className={`grid items-start gap-5 ${
          focus ? 'md:grid-cols-1' : noteId ? 'md:grid-cols-[200px_240px_1fr]' : 'md:grid-cols-[220px_1fr]'
        }`}
      >
        {!focus && (
          <div className={sectionId ? 'hidden md:block' : ''}>
            <SectionList activeId={sectionId} />
          </div>
        )}
        {!focus && sectionId && (
          <div className={noteId ? 'hidden md:block' : ''}>
            {section ? <NoteList section={section} activeId={noteId} /> : <Empty icon="folder">Esta carpeta ya no existe</Empty>}
          </div>
        )}
        {noteId && <NoteEditor key={noteId} noteId={noteId} />}
        {!noteId && !sectionId && (
          <div className="hidden md:block">
            <Placeholder />
          </div>
        )}
      </div>
    </div>
  )
}

function Placeholder() {
  return (
    <div className="grid min-h-[50dvh] place-items-center rounded-2xl border border-dashed border-ink-200 text-center">
      <div className="space-y-2 text-ink-400">
        <Icon name="notes" size={28} className="mx-auto" />
        <p className="text-sm">Elige una carpeta y abre o crea una nota</p>
      </div>
    </div>
  )
}
