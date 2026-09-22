export const ALERT_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 0, label: 'En el momento' },
  { minutes: 15, label: '15 min antes' },
  { minutes: 60, label: '1 hora antes' },
  { minutes: 120, label: '2 horas antes' },
  { minutes: 1440, label: '1 día antes' },
  { minutes: 2 * 1440, label: '2 días antes' },
  { minutes: 3 * 1440, label: '3 días antes' },
  { minutes: 7 * 1440, label: '1 semana antes' },
]

export type OffsetUnit = 'minutes' | 'hours' | 'days' | 'weeks'
export const UNIT_MINUTES: Record<OffsetUnit, number> = { minutes: 1, hours: 60, days: 1440, weeks: 10080 }

export function describeOffset(minutes: number): string {
  if (minutes === 0) return 'En el momento'
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many} antes`
  if (minutes % 10080 === 0) return plural(minutes / 10080, 'semana', 'semanas')
  if (minutes % 1440 === 0) return plural(minutes / 1440, 'día', 'días')
  if (minutes % 60 === 0) return plural(minutes / 60, 'hora', 'horas')
  return `${minutes} min antes`
}
