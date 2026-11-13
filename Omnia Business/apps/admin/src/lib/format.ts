const dateTime = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

export const formatDateTime = (d: Date | string | null) => (d ? dateTime.format(new Date(d)) : '—');
