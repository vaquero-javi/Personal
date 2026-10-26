import { Cell, PageHeader, Ruled } from '@/components/ui/layout';
import { ClockPanel } from '@/features/hr/clock-panel';
import { LimitBar } from '@/features/home/panels';
import { capitalizeFirst, formatMinutes, formatTime } from '@/lib/format';
import { entryType } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { clock } from './actions';

export const metadata = { title: 'Fichar · Omnia' };

const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const dayLabel = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });

export default async function ClockPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can } = await requireOrg(org);
  const day = await container().hr.myDay(ctx);
  const todayShift = day.shifts.find((s) => new Date(s.startsAt).toDateString() === new Date().toDateString());
  const shiftMinutes = todayShift ? Math.round((new Date(todayShift.endsAt).getTime() - new Date(todayShift.startsAt).getTime()) / 60000) : 0;
  const weekTotal = day.week.reduce((s, d) => s + d.minutes, 0);
  const missingNow = !!todayShift && new Date(todayShift.startsAt) < new Date() && !day.entries.some((e) => e.entryType === 'clock_in');

  return (
    <>
      <PageHeader title="Fichar" description="Registro de jornada (art. 34.9 ET): cada fichaje se conserva y no se puede modificar; las correcciones las registra RRHH con su motivo." />
      <Ruled cols="lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Cell title="Hoy">
          {can('hr.time.self') ? (
            <ClockPanel state={day.state} clock={clock.bind(null, org)} {...(missingNow ? { lateSince: formatTime(todayShift!.startsAt) } : {})} />
          ) : (
            <p className="text-sm text-ink-2">Tu rol no ficha en esta sociedad.</p>
          )}
          <div className="mt-6">
            <p className="flex items-baseline justify-between text-sm">
              <span className="text-ink-3">Trabajado hoy</span>
              <b className="text-lg">{formatMinutes(day.workedMinutes)}</b>
            </p>
            {todayShift && (
              <>
                <LimitBar value={Math.round((100 * day.workedMinutes) / Math.max(1, shiftMinutes))} tone={day.workedMinutes >= shiftMinutes ? 'ok' : 'neutral'} label="Trabajado sobre el turno" />
                <p className="mt-1 text-xs text-ink-3">
                  Turno {formatTime(todayShift.startsAt)}–{formatTime(todayShift.endsAt)}
                  {todayShift.area ? ` · ${todayShift.area}` : ''} ({formatMinutes(shiftMinutes)})
                </p>
              </>
            )}
          </div>
          <h4 className="mt-6 mb-2 text-sm font-bold">Fichajes de hoy</h4>
          {day.entries.length === 0 ? (
            <p className="rounded bg-sheet-head px-3 py-3 text-sm text-ink-2">Aún no hay fichajes hoy. Aparecerán aquí con su hora.</p>
          ) : (
            <ol className="divide-y divide-line-soft text-sm">
              {day.entries.map((e) => (
                <li key={e.id} className="flex justify-between gap-3 py-2">
                  <span>
                    {entryType[e.entryType]}
                    {e.source === 'manual' && <span className="text-ink-3"> · corrección de {e.createdByName}</span>}
                    {e.latitude && <span className="text-ink-3"> · con ubicación</span>}
                  </span>
                  <b>{formatTime(e.occurredAt)}</b>
                </li>
              ))}
            </ol>
          )}
        </Cell>
        <Cell title="Esta semana">
          <ul className="divide-y divide-line-soft text-sm">
            {day.week.map((d) => (
              <li key={d.day} className="flex justify-between gap-3 py-2">
                <span className="text-ink-2">{capitalizeFirst(weekday.format(new Date(`${d.day}T00:00:00Z`)).replaceAll('.', ''))}</span>
                <span className={d.minutes ? 'font-semibold' : 'text-ink-3'}>{d.minutes ? formatMinutes(d.minutes) : '—'}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 py-2">
              <span className="font-semibold">Total</span>
              <b>{formatMinutes(weekTotal)}</b>
            </li>
          </ul>
          <h4 className="mt-6 mb-2 text-sm font-bold">Próximos turnos</h4>
          {day.shifts.length === 0 ? (
            <p className="text-sm text-ink-3">No tienes turnos planificados esta semana.</p>
          ) : (
            <ul className="divide-y divide-line-soft text-sm">
              {day.shifts.map((s) => (
                <li key={s.id} className="flex justify-between gap-3 py-2">
                  <span>{capitalizeFirst(dayLabel.format(new Date(s.startsAt)).replaceAll('.', ''))}</span>
                  <span className="text-ink-2">
                    {formatTime(s.startsAt)}–{formatTime(s.endsAt)}
                    {s.area ? ` · ${s.area}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cell>
      </Ruled>
    </>
  );
}
