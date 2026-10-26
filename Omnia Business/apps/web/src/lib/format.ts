const TZ = 'Europe/Madrid';

const euro = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  // es-ES no agrupa los números de 4 cifras por defecto («4210,00 €»); en contabilidad sí.
  useGrouping: 'always',
});
const qty = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3, useGrouping: 'always' });
const dayMonthYear = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const weekdayDay = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dateTime = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const monthYear = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });

/** Solo para mostrar: el texto decimal de la API se convierte aquí, nunca para calcular importes. */
export const formatEuro = (decimal: string | number) => euro.format(Number(decimal));
export const formatQty = (decimal: string | number) => qty.format(Number(decimal));
/** Fechas `date` de Postgres (YYYY-MM-DD, sin hora). */
export const formatDate = (iso: string | null) => (iso ? dayMonthYear.format(new Date(`${iso}T00:00:00Z`)) : '—');
/** Solo la primera letra en mayúscula («Lun, 19 oct»), como se escribe en español. */
export const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const formatShortDate = (iso: string) => capitalizeFirst(weekdayDay.format(new Date(`${iso}T00:00:00Z`)).replaceAll('.', ''));
/** «2026-10-01» → «Octubre 2026». */
export const formatMonth = (iso: string) => capitalizeFirst(monthYear.format(new Date(`${iso.slice(0, 7)}-01T00:00:00Z`)).replace(' de ', ' '));
export const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
export const formatDateTime = (d: Date | string | null) => (d ? dateTime.format(new Date(d)) : '—');
export const formatTime = (d: Date | string) => time.format(new Date(d));
export const formatLongDate = (d: Date) => longDate.format(d).replace(/^\w/, (c) => c.toUpperCase());
export const formatMinutes = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
export const percent = (part: string | number, whole: string | number) =>
  Number(whole) === 0 ? 0 : Math.round((Number(part) / Number(whole)) * 100);

/** Hoy (YYYY-MM-DD) en hora peninsular. */
export const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** Lunes de la semana de `iso`. */
export const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
};
export const initials = (name: string | null | undefined) =>
  (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
