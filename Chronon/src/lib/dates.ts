import { addDays, format, isToday, isTomorrow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export const toDateInput = (d: Date) => format(d, 'yyyy-MM-dd')
export const toTimeInput = (d: Date) => format(d, 'HH:mm')

/** Combina los valores de <input type="date"> y <input type="time"> en una fecha local. */
export function fromInputs(date: string, time = '00:00'): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

export function formatEventWhen(startIso: string, allDay: boolean, endIso?: string | null): string {
  const start = parseISO(startIso)
  const day = isToday(start) ? 'Hoy' : isTomorrow(start) ? 'Mañana' : format(start, "EEE d 'de' MMM", { locale: es })
  if (allDay) {
    if (endIso) {
      const lastDay = addDays(parseISO(endIso), -1)
      if (lastDay > start) return `${day} → ${format(lastDay, "EEE d 'de' MMM", { locale: es })}`
    }
    return `${day} · Todo el día`
  }
  const time = format(start, 'HH:mm')
  return endIso ? `${day} · ${time}–${format(parseISO(endIso), 'HH:mm')}` : `${day} · ${time}`
}

export const formatShortDateTime = (iso: string) => format(parseISO(iso), "d MMM, HH:mm", { locale: es })
