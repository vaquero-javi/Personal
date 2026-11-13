import Link from 'next/link';
import type { ReactNode } from 'react';
import { Store } from 'lucide-react';
import { buttonClass } from '@/components/ui/button-styles';
import { Cell, EmptyState, PageHeader } from '@/components/ui/layout';
import { inputClass } from '@/components/ui/form';
import { BarChart, CHART_GRAY, CHART_INK } from '@/features/stats/bar-chart';
import { LiveRefresh } from '@/features/stats/live-refresh';
import { change } from '@/features/stats/period';
import { addDays, formatEuro, formatQty, formatShortDate, todayIso } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import type { DayFigures, WindowFigures } from '@omnia/stats/types';

export const metadata = { title: 'Comparación · Estadísticas · Omnia' };
// Siempre al momento: con el día de hoy, las cifras son en tiempo real.
export const dynamic = 'force-dynamic';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Hora pedida en la URL (HH:MM) o null. */
const parseClock = (raw: string | undefined) => (raw && HHMM.test(raw) ? raw : null);
const clock = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Madrid' });

/** Día pedido en la URL: válido y nunca futuro. */
function parseDay(raw: string | undefined, fallback: string, today: string) {
  if (!raw || !ISO.test(raw) || Number.isNaN(Date.parse(raw))) return fallback;
  return raw > today ? today : raw;
}

function dayLabel(iso: string, today: string) {
  if (iso === today) return 'Hoy';
  if (iso === addDays(today, -1)) return 'Ayer';
  const short = formatShortDate(iso);
  return iso.slice(0, 4) === today.slice(0, 4) ? short : `${short} ${iso.slice(0, 4)}`;
}

const ratio = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 100) / 100);

type Query = { a?: string; b?: string; af?: string; at?: string; bf?: string; bt?: string };

export default async function ComparePage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Query> }) {
  const { org } = await params;
  const query = await searchParams;
  const { ctx, can } = await requireOrg(org);
  if (!can('stats.read')) return null;

  const today = todayIso();
  const a = parseDay(query.a, today, today);
  const b = parseDay(query.b, addDays(a, -7), today);
  const stats = container().stats;

  // Horario opcional de cada día. Sin horas, el día entero. Solo «desde»: hasta
  // el cierre (medianoche); solo «hasta»: desde las 00:00. Si el día B no trae
  // horas, usa las del A.
  const raw = { af: parseClock(query.af), at: parseClock(query.at), bf: parseClock(query.bf), bt: parseClock(query.bt) };
  const byHours = Object.values(raw).some(Boolean);
  const hoursA = { from: raw.af ?? '00:00', to: raw.at ?? '00:00' };
  const hoursB = raw.bf || raw.bt ? { from: raw.bf ?? '00:00', to: raw.bt ?? '00:00' } : hoursA;

  let dayA: DayFigures | WindowFigures;
  let dayB: DayFigures | WindowFigures;
  let live: boolean;
  if (byHours) {
    // Si un tramo está en curso ahora, el otro se mide hasta el mismo punto de su tramo.
    let [wA, wB] = await Promise.all([stats.window(ctx, a, hoursA.from, hoursA.to), stats.window(ctx, b, hoursB.from, hoursB.to)]);
    if (wA.elapsedMinutes !== null && wB.elapsedMinutes === null) wB = await stats.window(ctx, b, hoursB.from, hoursB.to, wA.elapsedMinutes);
    else if (wB.elapsedMinutes !== null && wA.elapsedMinutes === null) wA = await stats.window(ctx, a, hoursA.from, hoursA.to, wB.elapsedMinutes);
    [dayA, dayB] = [wA, wB];
    live = wA.isToday || wB.isToday;
  } else {
    // Con hoy en la comparación, el otro día se mide también «hasta la misma hora».
    live = a === today || b === today;
    const until = live ? clock.format(new Date()) : null;
    [dayA, dayB] = await Promise.all([stats.day(ctx, a, until), stats.day(ctx, b, until)]);
  }

  const span = (h: { from: string; to: string }) => (h.from === '00:00' && h.to === '00:00' ? 'todo el día' : `${h.from}–${h.to}`);
  const labelA = byHours ? `${dayLabel(a, today)} · ${span(hoursA)}` : dayLabel(a, today);
  const labelB = byHours ? `${dayLabel(b, today)} · ${span(hoursB)}` : dayLabel(b, today);
  const base = `/o/${org}/estadisticas/comparar`;
  // Los atajos conservan las horas elegidas.
  const hoursQuery = Object.entries(raw)
    .filter(([, v]) => v)
    .map(([k, v]) => `&${k}=${v}`)
    .join('');
  const href = (na: string, nb: string) => `${base}?a=${na}&b=${nb}${hoursQuery}`;

  const quick = [
    { label: 'Día anterior', day: addDays(a, -1) },
    { label: 'Semana anterior', day: addDays(a, -7) },
    { label: 'Año anterior', day: addDays(a, -364) }, // mismo día de la semana
  ];

  return (
    <>
      <PageHeader
        title="Comparación"
        description="Compara la facturación de dos días, enteros o entre las horas que elijas. Con el día de hoy, las cifras se actualizan solas y el otro día se mide también hasta el mismo punto."
        actions={live ? <LiveRefresh seconds={30} /> : undefined}
      />

      <Cell>
        <form action={base} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <DayFields legend="Día A" prefix="a" day={a} from={raw.af} to={raw.at} max={today} />
            <span aria-hidden className="hidden pb-2 text-[15px] font-semibold text-ink-3 lg:inline">frente a</span>
            <DayFields legend="Día B" prefix="b" day={b} from={raw.bf} to={raw.bt} max={today} placeholder={byHours && !(raw.bf || raw.bt) ? hoursA : undefined} />
            <button type="submit" className={buttonClass('primary')}>
              Comparar
            </button>
          </div>
          <p className="text-[13px] text-ink-3">
            Horas opcionales: sin horas se compara el día entero. Si el «hasta» es anterior al «desde» (p. ej. de 20:00 a 03:00), el tramo sigue en la madrugada del día siguiente. Si el día B no lleva horas, usa las del A.
            {byHours && (
              <>
                {' '}
                <Link href={`${base}?a=${a}&b=${b}`} className="font-medium text-tint underline-offset-2 hover:underline">
                  Quitar las horas
                </Link>
              </>
            )}
          </p>
        </form>
        <nav aria-label="Atajos" className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {a !== today && <Shortcut href={href(today, addDays(today, -7))}>Hoy frente a la semana pasada</Shortcut>}
          <span className="text-[13px] text-ink-3">{labelA} frente a:</span>
          {quick.map((q) => (
            <Shortcut key={q.label} href={href(a, q.day)} current={b === q.day}>
              {q.label} · {dayLabel(q.day, today)}
            </Shortcut>
          ))}
        </nav>
      </Cell>

      {live && (a !== b || byHours) && (
        <LiveHeadline
          today={dayA.isToday ? dayA : dayB}
          other={dayA.isToday ? dayB : dayA}
          otherLabel={dayA.isToday ? labelB : labelA}
          sameMoment={byHours ? 'en el mismo punto de su tramo' : 'a la misma hora'}
        />
      )}

      <Cell title="Cifras del día">
        <Figures dayA={dayA} dayB={dayB} labelA={labelA} labelB={labelB} />
      </Cell>
      <Cell title="Ventas por hora">
        {byHours ? (
          <WindowHourly dayA={dayA} dayB={dayB} labelA={labelA} labelB={labelB} />
        ) : (
          <Hourly dayA={dayA} dayB={dayB} labelA={labelA} labelB={labelB} />
        )}
      </Cell>
    </>
  );
}

/** Fecha y, opcionalmente, el tramo horario de uno de los dos días. */
function DayFields({
  legend,
  prefix,
  day,
  from,
  to,
  max,
  placeholder,
}: {
  legend: string;
  prefix: 'a' | 'b';
  day: string;
  from: string | null;
  to: string | null;
  max: string;
  /** Horas que se usarán si se dejan vacías (las del día A). */
  placeholder?: { from: string; to: string } | undefined;
}) {
  return (
    <fieldset className="flex flex-wrap items-end gap-2">
      <legend className="sr-only">{legend}</legend>
      <label className="flex flex-col gap-1.5">
        <span className="px-0.5 text-[13px] font-medium text-ink-2">{legend}</span>
        <input type="date" name={prefix} defaultValue={day} max={max} required className={`${inputClass} w-44`} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="px-0.5 text-[13px] font-medium text-ink-2">Desde</span>
        <input type="time" name={`${prefix}f`} defaultValue={from ?? ''} step={900} placeholder={placeholder?.from} className={`${inputClass} w-28`} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="px-0.5 text-[13px] font-medium text-ink-2">Hasta</span>
        <input type="time" name={`${prefix}t`} defaultValue={to ?? ''} step={900} placeholder={placeholder?.to} className={`${inputClass} w-28`} />
      </label>
    </fieldset>
  );
}

function Shortcut({ href, current, children }: { href: string; current?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? 'true' : undefined}
      className="pressable rounded-full bg-fill px-3.5 py-1.5 font-medium text-ink-2 hover:bg-fill-strong hover:text-ink aria-[current]:bg-tint aria-[current]:text-on-tint"
    >
      {children}
    </Link>
  );
}

/** Variación en % con color: verde si sube, rojo si baja. */
function Delta({ now, before, money = true }: { now: number; before: number; money?: boolean }) {
  const pct = change(now, before);
  const diff = Math.round((now - before) * 100) / 100;
  if (diff === 0) return <span className="text-ink-3">=</span>;
  const up = diff > 0;
  return (
    <span className={`font-semibold whitespace-nowrap ${up ? 'text-ok' : 'text-danger'}`}>
      {up ? '▲' : '▼'} {money ? formatEuro(Math.abs(diff)) : formatQty(Math.abs(diff))}
      {pct !== null && <span className="ml-1 font-normal text-ink-3">({Math.abs(pct).toLocaleString('es-ES')} %)</span>}
    </span>
  );
}

/** Lo principal con el día de hoy: hasta ahora frente al otro día a la misma hora. */
function LiveHeadline({ today, other, otherLabel, sameMoment }: { today: DayFigures; other: DayFigures; otherLabel: string; sameMoment: string }) {
  const sameTime = other.untilTotal ?? 0;
  return (
    <section aria-label="Hoy en directo" className="grid gap-4 rounded-[var(--radius-card)] bg-sheet p-5 shadow-[var(--shadow-card)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:p-6">
      <div>
        <p className="text-[13px] font-medium text-ink-3">Hoy hasta las {today.now}</p>
        <p className="mt-1 font-display text-[40px] leading-none font-bold tracking-[-0.03em]">{formatEuro(today.total)}</p>
        <p className="mt-2 text-[14px]">
          <Delta now={today.total} before={sameTime} /> <span className="text-ink-3">frente a {otherLabel === 'Ayer' ? 'ayer' : otherLabel} {sameMoment}</span>
        </p>
      </div>
      <div className="md:border-l md:border-line-soft md:pl-5">
        <p className="text-[13px] font-medium text-ink-3">{otherLabel} {sameMoment === 'a la misma hora' ? `hasta las ${today.now}` : 'hasta el mismo punto'}</p>
        <p className="mt-1 font-display text-[28px] leading-tight font-bold tracking-[-0.02em] text-ink-2">{formatEuro(sameTime)}</p>
        <p className="mt-2 text-[14px] text-ink-3">
          Cerró el día con <b className="font-semibold text-ink">{formatEuro(other.total)}</b>
          {other.total > 0 && today.total < other.total && <> · faltan {formatEuro(other.total - today.total)} para igualarlo</>}
        </p>
      </div>
      <div className="md:border-l md:border-line-soft md:pl-5">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-3">
          <Store aria-hidden className="size-4" /> Ahora en mesas
        </p>
        <p className="mt-1 font-display text-[28px] leading-tight font-bold tracking-[-0.02em]">{formatEuro(today.openTotal)}</p>
        <p className="mt-2 text-[14px] text-ink-3">
          {today.openTabs === 0 ? 'Ninguna cuenta abierta' : `${today.openTabs} ${today.openTabs === 1 ? 'cuenta abierta' : 'cuentas abiertas'}, aún sin cobrar (aprox.)`}
        </p>
      </div>
    </section>
  );
}

function Figures({ dayA, dayB, labelA, labelB }: { dayA: DayFigures; dayB: DayFigures; labelA: string; labelB: string }) {
  const ticketA = ratio(dayA.total, dayA.count);
  const ticketB = ratio(dayB.total, dayB.count);
  const perGuestA = ratio(dayA.posTotal, dayA.guests);
  const perGuestB = ratio(dayB.posTotal, dayB.guests);
  const rows: { label: string; a: number | null; b: number | null; money?: boolean; strong?: boolean; hint?: string }[] = [
    { label: 'Ventas (IVA incl.)', a: dayA.total, b: dayB.total, strong: true },
    { label: 'Base imponible', a: dayA.base, b: dayB.base },
    { label: 'Tickets y facturas', a: dayA.count, b: dayB.count, money: false },
    { label: 'Ticket medio', a: ticketA, b: ticketB },
    { label: 'De ello, TPV', a: dayA.posTotal, b: dayB.posTotal, hint: 'Tickets de mesa y barra' },
    { label: 'Comensales', a: dayA.guests, b: dayB.guests, money: false },
    { label: 'Gasto por comensal', a: perGuestA, b: perGuestB },
    { label: 'Cobrado en efectivo', a: dayA.cash, b: dayB.cash },
    { label: 'Cobrado con tarjeta', a: dayA.card, b: dayB.card },
    { label: 'Otros cobros', a: dayA.otherPayments, b: dayB.otherPayments, hint: 'Transferencia, domiciliación…' },
  ];
  const fmt = (v: number | null, money = true) => (v === null ? '—' : money ? formatEuro(v) : formatQty(v));
  const live = dayA.isToday || dayB.isToday;
  return (
    <div className="-mx-4 overflow-x-auto md:-mx-5">
      <table className="w-full min-w-[520px] border-collapse text-[14px]">
        <thead>
          <tr className="text-[12px] text-ink-3">
            <th scope="col" className="border-b border-line-soft pb-2 pl-4 text-left font-medium md:pl-5">
              <span className="sr-only">Concepto</span>
            </th>
            <th scope="col" className="border-b border-line-soft px-2 pb-2 text-right font-semibold text-tint">
              {labelA}
              {dayA.isToday && live && <span className="block font-normal text-ink-3">hasta ahora</span>}
            </th>
            <th scope="col" className="border-b border-line-soft px-2 pb-2 text-right font-semibold text-ink-2">
              {labelB}
              {dayB.isToday && live && <span className="block font-normal text-ink-3">hasta ahora</span>}
            </th>
            <th scope="col" className="border-b border-line-soft pr-4 pb-2 pl-2 text-right font-medium md:pr-5">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="group/row">
              <th scope="row" className={`border-b border-line-soft py-2.5 pl-4 text-left group-last/row:border-b-0 md:pl-5 ${r.strong ? 'font-semibold' : 'font-normal text-ink-2'}`}>
                {r.label}
                {r.hint && <span className="block text-[12px] font-normal text-ink-3">{r.hint}</span>}
              </th>
              <td className={`border-b border-line-soft px-2 py-2.5 text-right group-last/row:border-b-0 ${r.strong ? 'text-[17px] font-bold' : ''}`}>{fmt(r.a, r.money)}</td>
              <td className={`border-b border-line-soft px-2 py-2.5 text-right text-ink-2 group-last/row:border-b-0 ${r.strong ? 'text-[17px] font-semibold' : ''}`}>{fmt(r.b, r.money)}</td>
              <td className="border-b border-line-soft py-2.5 pr-4 pl-2 text-right group-last/row:border-b-0 md:pr-5">
                {r.a === null || r.b === null ? <span className="text-ink-3">—</span> : <Delta now={r.a} before={r.b} money={r.money !== false} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Hourly({ dayA, dayB, labelA, labelB }: { dayA: DayFigures; dayB: DayFigures; labelA: string; labelB: string }) {
  const active = dayA.hourly.map((h, i) => h.total !== 0 || dayB.hourly[i]!.total !== 0);
  const firstHour = active.indexOf(true);
  const untimed = dayA.untimedTotal + dayB.untimedTotal;
  if (firstHour === -1) {
    return (
      <EmptyState title="Sin ventas con hora en estos días">
        Aquí aparecerán, hora a hora, los tickets y facturas emitidos cada día.
        {untimed > 0 && ` Hay ${formatEuro(untimed)} expedidos con fecha distinta a la de su registro, que no tienen hora.`}
      </EmptyState>
    );
  }
  const lastHour = active.lastIndexOf(true);
  // Con hoy, el eje llega hasta la hora actual para ver «dónde vamos».
  const nowHour = dayA.isToday || dayB.isToday ? Number((dayA.isToday ? dayA : dayB).now.slice(0, 2)) : lastHour;
  const from = Math.max(0, Math.min(firstHour, nowHour) - 1);
  const to = Math.min(23, Math.max(lastHour, nowHour));
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <>
      <BarChart
        title={`Ventas por hora: ${labelA} frente a ${labelB}`}
        labels={hours.map((h) => `${h} h`)}
        series={[
          { name: labelA, color: CHART_INK, values: hours.map((h) => dayA.hourly[h]!.total) },
          { name: labelB, color: CHART_GRAY, values: hours.map((h) => dayB.hourly[h]!.total) },
        ]}
      />
      {untimed > 0 && (
        <p className="mt-3 text-[13px] text-ink-3">
          {formatEuro(untimed)} se expidieron con fecha distinta a la de su registro y no tienen hora: cuentan en las cifras del día, pero no en el gráfico.
        </p>
      )}
    </>
  );
}

/**
 * Ventas por hora de dos tramos: hora a hora desde el inicio de cada uno. Si
 * empiezan a horas distintas, cada barra lleva las dos horas («20 h / 18 h»).
 */
function WindowHourly({ dayA, dayB, labelA, labelB }: { dayA: DayFigures; dayB: DayFigures; labelA: string; labelB: string }) {
  const length = Math.max(dayA.hourly.length, dayB.hourly.length);
  if (dayA.total === 0 && dayB.total === 0) {
    return <EmptyState title="Sin ventas en estos tramos">Aquí aparecerán, hora a hora, los tickets y facturas emitidos en cada tramo.</EmptyState>;
  }
  const sameHours = dayA.hourly.every((h, i) => dayB.hourly[i] === undefined || dayB.hourly[i]!.hour === h.hour);
  const labels = Array.from({ length }, (_, i) => {
    const hA = dayA.hourly[i]?.hour;
    const hB = dayB.hourly[i]?.hour;
    if (sameHours || hA === undefined || hB === undefined) return `${hA ?? hB} h`;
    return `${hA} h / ${hB} h`;
  });
  return (
    <BarChart
      title={`Ventas por hora: ${labelA} frente a ${labelB}`}
      labels={labels}
      series={[
        { name: labelA, color: CHART_INK, values: Array.from({ length }, (_, i) => dayA.hourly[i]?.total ?? 0) },
        { name: labelB, color: CHART_GRAY, values: Array.from({ length }, (_, i) => dayB.hourly[i]?.total ?? 0) },
      ]}
    />
  );
}
