import { formatEventWhen } from '../../lib/dates'
import { describeOffset } from '../../lib/alertOffsets'
import { Empty, Skeleton } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useEventEditor } from '../calendar/EventEditor'
import { useDismissAlerts, useDueAlerts, useSnoozeAlert } from './api'

const SNOOZE = [
  { minutes: 60, label: '1 h' },
  { minutes: 24 * 60, label: 'Mañana' },
]

const chip =
  'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] text-ink-600 ring-1 ring-inset ring-ink-200 transition-colors duration-200 hover:bg-ink-100 hover:text-ink-900'

export function AlertsList({ onNavigate }: { onNavigate?: () => void }) {
  const { data: alerts = [], isLoading } = useDueAlerts()
  const dismiss = useDismissAlerts()
  const snooze = useSnoozeAlert()
  const { openEdit } = useEventEditor()

  if (isLoading) return <Skeleton rows={2} />
  if (alerts.length === 0) return <Empty icon="check">Todo al día. No tienes avisos pendientes.</Empty>

  return (
    <ul className="divide-y divide-ink-100">
      {alerts.map((a) => (
        <li key={a.id} className="flex gap-3 py-3 first:pt-1">
          <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: a.events.color }} />
          <div className="min-w-0 flex-1">
            <button
              className="block max-w-full truncate text-left text-sm font-medium text-ink-900 hover:underline decoration-ink-300 underline-offset-2"
              onClick={() => {
                openEdit(a.events.id)
                onNavigate?.()
              }}
            >
              {a.events.title}
            </button>
            <p className="mt-0.5 text-xs text-ink-500">
              {formatEventWhen(a.events.start_at, a.events.all_day, a.events.end_at)} · aviso {describeOffset(a.offset_minutes).toLowerCase()}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button className={chip} onClick={() => dismiss.mutate([a.id])}>
                <Icon name="check" size={13} /> Descartar
              </button>
              {SNOOZE.map((s) => (
                <button key={s.minutes} className={chip} onClick={() => snooze.mutate({ id: a.id, minutes: s.minutes })}>
                  <Icon name="snooze" size={13} /> {s.label}
                </button>
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
