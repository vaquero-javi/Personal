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

  // En móvil se muestra solo el nivel más profundo (secciones → notas → editor);
  // en escritorio, las tres columnas.
  return (
    <div className="space-y-5">
      <div className={sectionId ? 'hidden md:block' : ''}>
        <PageHeader eyebrow="Ideas, listas y todo lo demás" title="Apuntes" />
      </div>
    <div className="grid items-start gap-5 md:grid-cols-[200px_260px_1fr] lg:grid-cols-[210px_300px_1fr]">
      <div className={sectionId ? 'hidden md:block' : ''}>
        <SectionList activeId={sectionId} />
      </div>
      <div className={!sectionId || noteId ? 'hidden md:block' : ''}>
        {section ? <NoteList section={section} activeId={noteId} /> : <Empty icon="folder">Elige o crea una sección</Empty>}
      </div>
      <div className={noteId ? '' : 'hidden md:block'}>
        {noteId ? <NoteEditor key={noteId} noteId={noteId} /> : section && <Placeholder />}
      </div>
    </div>
    </div>
  )
}

function Placeholder() {
  return (
    <div className="grid min-h-[50dvh] place-items-center rounded-2xl border border-dashed border-ink-200 text-center">
      <div className="space-y-2 text-ink-400">
        <Icon name="notes" size={28} className="mx-auto" />
        <p className="text-sm">Elige una nota o crea una nueva</p>
      </div>
    </div>
  )
}
