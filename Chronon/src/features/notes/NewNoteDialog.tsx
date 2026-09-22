import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { Icon, type IconName } from '../../components/Icon'
import { EMPTY_DRAWING, type NoteDrawing, type NoteMode, type PaperStyle } from './drawing'

const MODES: { value: NoteMode; label: string; hint: string; icon: IconName }[] = [
  { value: 'hand', label: 'A mano', hint: 'Con el Apple Pencil', icon: 'pen' },
  { value: 'text', label: 'Teclado', hint: 'Escribiendo texto', icon: 'text' },
]

const PAPERS: { value: PaperStyle; label: string }[] = [
  { value: 'ruled', label: 'Líneas' },
  { value: 'grid', label: 'Cuadros' },
  { value: 'plain', label: 'Blanca' },
]

export function NewNoteDialog({
  onClose,
  onCreate,
  busy,
}: {
  onClose: () => void
  onCreate: (drawing: NoteDrawing) => void
  busy: boolean
}) {
  const [mode, setMode] = useState<NoteMode>('hand')
  const [paper, setPaper] = useState<PaperStyle>('ruled')

  return (
    <Modal title="Nueva nota" onClose={onClose}>
      <div className="space-y-6">
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-600">¿Cómo vas a escribir?</legend>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={mode === m.value}
                onClick={() => setMode(m.value)}
                className={`flex flex-col items-start gap-1 rounded-xl p-3.5 text-left transition-[background-color,box-shadow] duration-200 ${mode === m.value ? 'bg-surface shadow-soft ring-2 ring-accent-400' : 'bg-ink-100 ring-1 ring-transparent hover:bg-ink-50'}`}
              >
                <Icon name={m.icon} size={20} className={mode === m.value ? 'text-accent-500' : 'text-ink-500'} />
                <span className="text-sm font-medium text-ink-900">{m.label}</span>
                <span className="text-xs text-ink-500">{m.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-600">¿Qué hoja?</legend>
          <div className="grid grid-cols-3 gap-2">
            {PAPERS.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={paper === p.value}
                onClick={() => setPaper(p.value)}
                className={`overflow-hidden rounded-xl p-1 transition-[box-shadow] duration-200 ${paper === p.value ? 'shadow-soft ring-2 ring-accent-400' : 'ring-1 ring-ink-200 hover:ring-ink-300'}`}
              >
                <span className={`paper paper-${p.value} block h-16 w-full rounded-lg ring-1 ring-ink-200/60`} aria-hidden />
                <span className="block py-1.5 text-xs font-medium text-ink-700">{p.label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={busy} onClick={() => onCreate({ ...EMPTY_DRAWING, mode, paper })}>
            {busy ? 'Creando…' : 'Crear nota'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
