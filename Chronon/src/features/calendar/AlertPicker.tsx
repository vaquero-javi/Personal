import { useState } from 'react'
import { ALERT_PRESETS, UNIT_MINUTES, describeOffset, type OffsetUnit } from '../../lib/alertOffsets'
import { formatShortDateTime } from '../../lib/dates'
import { Button, inputClass } from '../../components/ui'
import { Icon } from '../../components/Icon'

interface Props {
  value: number[]
  onChange: (offsets: number[]) => void
  /** Inicio del evento, para mostrar cuándo saltará cada aviso. */
  start: Date | null
  allDay: boolean
}

export function AlertPicker({ value, onChange, start, allDay }: Props) {
  const [custom, setCustom] = useState(false)
  const [amount, setAmount] = useState(1)
  const [unit, setUnit] = useState<OffsetUnit>('days')

  const add = (minutes: number) => {
    if (!value.includes(minutes)) onChange([...value, minutes].sort((a, b) => b - a))
  }

  const fireAt = (offset: number) => {
    if (!start) return null
    const base = start.getTime() + (allDay ? 9 * 3600_000 : 0)
    return new Date(base - offset * 60_000)
  }

  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-sm text-ink-400">Sin avisos</p>}
      <ul className="flex flex-wrap gap-1.5">
        {value.map((offset) => {
          const at = fireAt(offset)
          const past = at !== null && at < new Date()
          return (
            <li
              key={offset}
              className={`flex h-8 items-center gap-1.5 rounded-lg pl-2.5 pr-1 text-[13px] ${past ? 'text-ink-400 ring-1 ring-inset ring-ink-200 line-through decoration-ink-300' : 'bg-accent-50 text-accent-700'}`}
              title={past ? 'Esta fecha ya ha pasado: no saltará' : undefined}
            >
              <Icon name="bell" size={13} />
              {describeOffset(offset)}
              {at && <span className="font-mono text-[11px] opacity-70">{formatShortDateTime(at.toISOString())}</span>}
              <button
                type="button"
                className="grid size-6 place-items-center rounded-md opacity-60 transition-opacity hover:bg-black/5 hover:opacity-100"
                onClick={() => onChange(value.filter((v) => v !== offset))}
                aria-label="Quitar aviso"
              >
                <Icon name="x" size={13} />
              </button>
            </li>
          )
        })}
      </ul>

      {custom ? (
        <div className="flex gap-2">
          <input type="number" min={1} className={`${inputClass} w-20`} value={amount} onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))} />
          <select className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value as OffsetUnit)}>
            <option value="minutes">minutos antes</option>
            <option value="hours">horas antes</option>
            <option value="days">días antes</option>
            <option value="weeks">semanas antes</option>
          </select>
          <Button type="button" variant="primary" onClick={() => { add(amount * UNIT_MINUTES[unit]); setCustom(false) }}>
            Añadir
          </Button>
        </div>
      ) : (
        <select
          className={inputClass}
          value=""
          onChange={(e) => {
            if (e.target.value === 'custom') setCustom(true)
            else if (e.target.value) add(Number(e.target.value))
          }}
        >
          <option value="">+ Añadir aviso…</option>
          {ALERT_PRESETS.filter((p) => !value.includes(p.minutes)).map((p) => (
            <option key={p.minutes} value={p.minutes}>
              {p.label}
            </option>
          ))}
          <option value="custom">Personalizado…</option>
        </select>
      )}
      {allDay && <p className="text-xs text-ink-400">En eventos de todo el día los avisos se calculan desde las 9:00.</p>}
    </div>
  )
}
