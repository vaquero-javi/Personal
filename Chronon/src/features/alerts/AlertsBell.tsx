import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { AlertsList } from './AlertsList'
import { useDismissAlerts, useDueAlerts } from './api'

export function AlertsBell() {
  const [open, setOpen] = useState(false)
  const { data: alerts = [] } = useDueAlerts()
  const dismiss = useDismissAlerts()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative grid size-9 place-items-center rounded-xl transition-colors duration-200 ${open ? 'bg-ink-100 text-ink-900' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900'}`}
        aria-label={`Avisos (${alerts.length})`}
        aria-expanded={open}
      >
        <Icon name="bell" size={19} />
        {alerts.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-500 px-1 font-mono text-[10px] font-semibold text-white ring-2 ring-ink-50">
            {alerts.length > 99 ? '99+' : alerts.length}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-40 max-h-[70dvh] origin-top-right animate-sheet overflow-y-auto rounded-2xl bg-surface p-5 shadow-float ring-1 ring-ink-200/70 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-2xl leading-none">Avisos</h2>
            {alerts.length > 1 && (
              <button className="text-[13px] text-ink-500 transition-colors hover:text-ink-900" onClick={() => dismiss.mutate(alerts.map((a) => a.id))}>
                Descartar todos
              </button>
            )}
          </div>
          <AlertsList onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
