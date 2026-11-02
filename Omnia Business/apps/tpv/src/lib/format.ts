const TZ = 'Europe/Madrid';

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, useGrouping: 'always' });
const qty = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3, useGrouping: 'always' });
const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dateTime = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });

/** Solo para mostrar: los importes llegan como texto decimal y se calculan en el servidor. */
export const formatEuro = (decimal: string | number) => euro.format(Number(decimal));
export const formatQty = (decimal: string | number) => qty.format(Number(decimal));
export const formatTime = (d: Date | string) => time.format(new Date(d));
export const formatDateTime = (d: Date | string | null) => (d ? dateTime.format(new Date(d)) : '—');

/** «12 min», «1 h 05». */
export function elapsed(since: Date | string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

export const initials = (name: string | null | undefined) =>
  (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
