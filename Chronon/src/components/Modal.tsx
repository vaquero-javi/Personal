import { useEffect, type ReactNode } from 'react'
import { IconButton } from './ui'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade items-end justify-center bg-ink-950/30 backdrop-blur-[3px] sm:items-center sm:p-4 dark:bg-black/50"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92dvh] w-full animate-sheet overflow-y-auto rounded-t-3xl bg-surface shadow-float sm:max-w-lg sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between bg-surface/90 px-6 pt-5 pb-3 backdrop-blur">
          <span className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-ink-200 sm:hidden" aria-hidden />
          <h2 className="font-display text-[1.75rem] leading-none tracking-tight">{title}</h2>
          <IconButton icon="x" label="Cerrar" onClick={onClose} className="-mr-2" />
        </div>
        <div className="px-6 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  )
}
