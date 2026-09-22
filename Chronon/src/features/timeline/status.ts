import { differenceInMinutes, parseISO } from 'date-fns'
import type { CalendarEvent } from '../../lib/types'

export type Status = 'done' | 'overdue' | 'pending' | 'in-progress' | 'finished'

export interface TimelineInfo {
  status: Status
  /** Texto de tiempo: "Faltan 3 d 4 h", "Atrasado 2 d"… */
  label: string
  /** 0–1: cuánto del tiempo entre su creación y su fecha ha pasado ya (solo pendientes). */
  progress: number | null
}

/** Duración compacta: "3 d 4 h", "5 h 20 min", "12 min". */
export function formatSpan(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const min = m % 60
  if (d >= 7) return `${d} d`
  if (d > 0) return h ? `${d} d ${h} h` : `${d} d`
  if (h > 0) return min ? `${h} h ${min} min` : `${h} h`
  return `${min} min`
}

/** Momento en que "vence": en eventos de todo el día, el final del día. */
function dueDate(e: CalendarEvent) {
  const start = parseISO(e.start_at)
  return e.all_day && e.type === 'reminder' ? new Date(start.getTime() + 86_400_000 - 1) : start
}

export function getTimelineInfo(e: CalendarEvent, now: Date): TimelineInfo {
  const start = parseISO(e.start_at)
  const due = dueDate(e)

  if (e.type === 'reminder') {
    if (e.completed) return { status: 'done', label: 'Hecho', progress: null }
    const left = differenceInMinutes(due, now)
    if (left < 0) return { status: 'overdue', label: `Atrasado ${formatSpan(-left)}`, progress: 1 }
    return { status: 'pending', label: `Faltan ${formatSpan(left)}`, progress: progressBetween(parseISO(e.created_at), due, now) }
  }

  const end = e.end_at ? parseISO(e.end_at) : e.all_day ? new Date(start.getTime() + 86_400_000) : start
  if (now >= end && now > start) return { status: 'finished', label: 'Terminado', progress: null }
  if (now >= start) return { status: 'in-progress', label: `En curso · queda ${formatSpan(differenceInMinutes(end, now))}`, progress: progressBetween(start, end, now) }
  return { status: 'pending', label: `Faltan ${formatSpan(differenceInMinutes(start, now))}`, progress: progressBetween(parseISO(e.created_at), start, now) }
}

function progressBetween(from: Date, to: Date, now: Date) {
  const total = to.getTime() - from.getTime()
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, (now.getTime() - from.getTime()) / total))
}

export const STATUS_STYLE: Record<Status, { badge: string; dot: string; bar: string; text: string }> = {
  done: { badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', bar: 'bg-emerald-500', text: 'Hecho' },
  overdue: { badge: 'bg-red-50 text-red-700', dot: 'bg-red-500', bar: 'bg-red-500', text: 'Atrasado' },
  pending: { badge: 'bg-ink-100 text-ink-700', dot: 'bg-surface border-2 border-ink-400', bar: 'bg-ink-400', text: 'Pendiente' },
  'in-progress': { badge: 'bg-accent-50 text-accent-700', dot: 'bg-accent-500 ring-4 ring-accent-100', bar: 'bg-accent-500', text: 'En curso' },
  finished: { badge: 'bg-ink-100 text-ink-500', dot: 'bg-ink-300', bar: 'bg-ink-300', text: 'Terminado' },
}
