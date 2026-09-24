import { useParams } from 'react-router'
import { FolderBrowser } from './FolderBrowser'
import { NoteEditor } from './NoteEditor'

export function NotesPage() {
  const { sectionId, noteId } = useParams()
  // Una nota abierta ocupa toda la pantalla, como un cuaderno; al cerrarla se vuelve a su carpeta.
  if (noteId) return <NoteEditor key={noteId} noteId={noteId} />
  return <FolderBrowser key={sectionId ?? 'root'} sectionId={sectionId} />
}
