// Fecha corta al estilo de un correo: hoy, la hora; este año, día y mes; antes, la fecha.
const TZ = 'Europe/Madrid';
const hour = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dayMonth = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: TZ });
const full = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: TZ });
const long = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });

export function shortWhen(d: Date, now = new Date()): string {
  if (ymd.format(d) === ymd.format(now)) return hour.format(d);
  if (ymd.format(d).slice(0, 4) === ymd.format(now).slice(0, 4)) return dayMonth.format(d).replace('.', '');
  return full.format(d);
}

export const longWhen = (d: Date) => long.format(d);
