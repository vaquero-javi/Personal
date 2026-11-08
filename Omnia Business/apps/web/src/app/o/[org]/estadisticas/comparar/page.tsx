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
import type { DayFigures } from '@omnia/stats/types';

export const metadata = { title: 'Comparación · Estadísticas · Omnia' };
// Siempre al momento: con el día de hoy, las cifras son en tiempo real.
export const dynamic = 'force-dynamic';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
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

export default async function ComparePage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const { org } = await params;
  const query = await searchParams;
  const { ctx, can } = await requireOrg(org);
  if (!can('stats.read')) return null;

  const today = todayIso();
  const a = parseDay(query.a, today, today);
  const b = parseDay(query.b, addDays(a, -7), today);
  const stats = container().stats;

  // Con hoy en la comparación, el otro día se mide también «hasta la misma hora».
  const live = a === today || b === today;
  const until = live ? clock.format(new Date()) : null;
  const [dayA, dayB] = await Promise.all([stats.day(ctx, a, until), stats.day(ctx, b, until)]);

  const labelA = dayLabel(a, today);
  const labelB = dayLabel(b, today);
  const base = `/o/${org}/estadisticas/comparar`;
  const href = (na: string, nb: string) => `${base}?a=${na}&b=${nb}`;

  const quick = [
    { label: 'Día anterior', day: addDays(a, -1) },
    { label: 'Semana anterior', day: addDays(a, -7) },
    { label: 'Año anterior', day: addDays(a, -364) }, // mismo día de la semana
  ];

  return (
    <>
      <PageHeader
        title="Comparación"
        description="Compara la facturación de dos días. Con el día de hoy, las cifras se actualizan solas y el otro día se mide también hasta la misma hora."
        actions={live ? <LiveRefresh seconds={30} /> : undefined}
      />

      <Cell>
        <form action={base} className="flex flex-wrap items-end gap-3">
          <DayField label="Día A" name="a" value={a} max={today} />
          <span aria-hidden className="hidden pb-2 text-[15px] font-semibold text-ink-3 sm:inline">frente a</span>
          <DayField label="Día B" name="b" value={b} max={today} />
          <button type="submit" className={buttonClass('primary')}>
            Comparar
          </button>
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

      {live && a !== b && <LiveHeadline today={a === today ? dayA : dayB} other={a === today ? dayB : dayA} otherLabel={a === today ? labelB : labelA} />}

      <Cell title="Cifras del día">
        <Figures dayA={dayA} dayB={dayB} labelA={labelA} labelB={labelB} />
      </Cell>
      <Cell title="Ventas por hora">
        <Hourly dayA={dayA} dayB={dayB} labelA={labelA} labelB={labelB} />
      </Cell>
    </>
  );
}

function DayField({ label, name, value, max }: { label: string; name: string; value: string; max: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="px-0.5 text-[13px] font-medium text-ink-2">{label}</span>
      <input type="date" name={name} defaultValue={value} max={max} required className={`${inputClass} w-44`} />
    </label>
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
function LiveHeadline({ today, other, otherLabel }: { today: DayFigures; other: DayFigures; otherLabel: string }) {
  const sameTime = other.untilTotal ?? 0;
  return (
    <section aria-label="Hoy en directo" className="grid gap-4 rounded-[var(--radius-card)] bg-sheet p-5 shadow-[var(--shadow-card)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:p-6">
      <div>
        <p className="text-[13px] font-medium text-ink-3">Hoy hasta las {today.now}</p>
        <p className="mt-1 font-display text-[40px] leading-none font-bold tracking-[-0.03em]">{formatEuro(today.total)}</p>
        <p className="mt-2 text-[14px]">
          <Delta now={today.total} before={sameTime} /> <span className="text-ink-3">frente a {otherLabel === 'Ayer' ? 'ayer' : otherLabel} a la misma hora</span>
        </p>
      </div>
      <div className="md:border-l md:border-line-soft md:pl-5">
        <p className="text-[13px] font-medium text-ink-3">{otherLabel} hasta las {today.now}</p>
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
