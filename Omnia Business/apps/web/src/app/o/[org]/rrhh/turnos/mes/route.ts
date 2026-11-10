import { addDays, formatShortDate, formatTime, todayIso } from '@/lib/format';
import { container } from '@/server/container';
import { requirePermission } from '@/server/session';

const isoInMadrid = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);

/**
 * Cuadrante de turnos de un mes en CSV (separador «;», como lo abre Excel en
 * español): una fila por persona, una columna por día y el total de horas.
 * `?mes=YYYY-MM`; por defecto, el mes en curso.
 */
export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requirePermission(org, 'hr.shifts.manage');
  const raw = new URL(request.url).searchParams.get('mes');
  const month = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : todayIso().slice(0, 7);

  const first = `${month}-01`;
  const days: string[] = [];
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) days.push(d);

  // Un día de margen a cada lado: la consulta corta en UTC y aquí se agrupa por día peninsular.
  const [shifts, people] = await Promise.all([
    container().hr.shifts(ctx, addDays(first, -1), days.length + 2),
    container().hr.people(ctx),
  ]);
  const inMonth = shifts.filter((s) => isoInMadrid(new Date(s.startsAt)).startsWith(month));

  const rows = people.map((p) => ({ userId: p.userId, name: p.name }));
  for (const s of inMonth) if (!rows.some((r) => r.userId === s.userId)) rows.push({ userId: s.userId, name: s.userName });

  const cell = (text: string) => (/[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text);
  const lines = [
    ['Persona', ...days.map(formatShortDate), 'Turnos', 'Horas'].map(cell).join(';'),
    ...rows.map((r) => {
      const own = inMonth.filter((s) => s.userId === r.userId);
      const minutes = own.reduce((sum, s) => sum + (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60000, 0);
      const byDay = days.map((d) =>
        own
          .filter((s) => isoInMadrid(new Date(s.startsAt)) === d)
          .map((s) => `${formatTime(s.startsAt)}-${formatTime(s.endsAt)}${isoInMadrid(new Date(s.endsAt)) !== d ? ' (+1)' : ''}${s.area ? ` (${s.area})` : ''}`)
          .join(' / '),
      );
      return [r.name, ...byDay, String(own.length), (minutes / 60).toFixed(2).replace('.', ',')].map(cell).join(';');
    }),
  ];

  return new Response(`﻿${lines.join('\r\n')}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="turnos-${org}-${month}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
