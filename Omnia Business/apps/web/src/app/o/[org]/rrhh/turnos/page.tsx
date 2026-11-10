import Link from 'next/link';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { Cell, PageHeader, Ruled } from '@/components/ui/layout';
import { ActionForm, inputClass, SelectField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/button-styles';
import { addDays, capitalizeFirst, formatTime, mondayOf, todayIso } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { ShiftCell } from '@/features/hr/shift-cell';
import { createShift, deleteShift } from '../actions';

export const metadata = { title: 'Turnos · Omnia' };

const head = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const isoInMadrid = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);

export default async function ShiftsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ semana?: string }> }) {
  const { org } = await params;
  const { semana } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  const monday = mondayOf(semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? semana : todayIso());
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const [shifts, people] = await Promise.all([container().hr.shifts(ctx, monday, 7), container().hr.people(ctx)]);
  const manage = can('hr.shifts.manage');
  // Ver el cuadrante de todo el equipo: permiso «Ver los turnos de todo el equipo» (o poder planificarlos).
  const visiblePeople = manage || can('hr.shifts.read') ? people : people.filter((p) => p.userId === ctx.userId);
  const base = `/o/${org}/rrhh/turnos`;
  const today = todayIso();

  return (
    <>
      <PageHeader
        title="Turnos"
        description={`Semana del ${head.format(new Date(`${monday}T00:00:00Z`))} al ${head.format(new Date(`${days[6]}T00:00:00Z`))}`}
        actions={
          <div className="flex flex-wrap items-center gap-1">
            {manage && (
              <form action={`${base}/mes`} method="get" className="mr-2 flex items-center gap-1">
                <label htmlFor="mes-descarga" className="sr-only">Mes a descargar</label>
                <input id="mes-descarga" name="mes" type="month" defaultValue={addDays(monday, 3).slice(0, 7)} required className={`${inputClass} w-auto`} />
                <button type="submit" className={buttonClass('secondary')}>
                  <Download aria-hidden className="size-4" />
                  Descargar mes
                </button>
              </form>
            )}
            <Link href={`${base}?semana=${addDays(monday, -7)}`} className={buttonClass('secondary', 'px-2')} aria-label="Semana anterior"><ChevronLeft aria-hidden className="size-4" /></Link>
            <Link href={base} className={buttonClass('secondary')}>Esta semana</Link>
            <Link href={`${base}?semana=${addDays(monday, 7)}`} className={buttonClass('secondary', 'px-2')} aria-label="Semana siguiente"><ChevronRight aria-hidden className="size-4" /></Link>
          </div>
        }
      />
      <Ruled cols={manage ? 'xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]' : ''}>
        <Cell>
          <div className="-mx-4 overflow-x-auto md:-mx-5">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className="w-40 border-b border-line bg-sheet-head px-2 py-2 pl-4 text-left text-xs font-semibold text-ink-3 md:pl-5">Persona</th>
                  {days.map((d) => (
                    <th key={d} scope="col" className={`border-b border-l border-line px-2 py-2 text-left text-xs font-semibold ${d === today ? 'bg-tint text-on-tint' : 'bg-sheet-head text-ink-3'}`}>
                      {capitalizeFirst(head.format(new Date(`${d}T00:00:00Z`)).replaceAll('.', ''))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiblePeople.map((p) => (
                  <tr key={p.userId}>
                    <th scope="row" className="border-b border-line-soft px-2 py-2 pl-4 text-left font-medium md:pl-5">{p.name}</th>
                    {days.map((d) => {
                      const own = shifts.filter((s) => s.userId === p.userId && isoInMadrid(new Date(s.startsAt)) === d);
                      return (
                        <ShiftCell key={d} action={createShift.bind(null, org)} userId={p.userId} date={d} label={`${p.name}, ${head.format(new Date(`${d}T00:00:00Z`))}`} editable={manage}>
                          {own.map((s) => (
                            <div key={s.id} className="group mb-1 flex items-start justify-between gap-1 rounded bg-carton px-2 py-1 text-xs">
                              <span>
                                <b>{formatTime(s.startsAt)}–{formatTime(s.endsAt)}</b>
                                {isoInMadrid(new Date(s.endsAt)) !== d && <span className="ml-1 text-ink-3" title="Termina al día siguiente">+1</span>}
                                {s.area && <span className="block text-ink-3">{s.area}</span>}
                              </span>
                              {manage && (
                                <ActionForm action={deleteShift.bind(null, org, s.id)}>
                                  <button type="submit" aria-label={`Borrar turno de ${p.name}`} className="rounded p-0.5 text-ink-3 opacity-60 hover:bg-sheet hover:text-danger group-hover:opacity-100">
                                    <X aria-hidden className="size-3.5" />
                                  </button>
                                </ActionForm>
                              )}
                            </div>
                          ))}
                        </ShiftCell>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cell>
        {manage && (
          <Cell title="Nuevo turno">
            <ActionForm action={createShift.bind(null, org)} className="flex flex-col gap-3" successMessage="Turno creado">
              <SelectField label="Persona" name="userId" options={people.map((p) => ({ value: p.userId, label: p.name }))} placeholder="Elige…" required />
              <TextField label="Día" name="date" type="date" defaultValue={days.includes(today) ? today : monday} required />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Entrada" name="from" type="time" defaultValue="08:00" required />
                <TextField label="Salida" name="to" type="time" defaultValue="16:00" required />
              </div>
              <p className="-mt-1 text-xs text-ink-3">Si la salida es antes que la entrada, el turno acaba al día siguiente.</p>
              <TextField label="Área o puesto" name="area" placeholder="Almacén" />
              <div>
                <SubmitButton>Crear turno</SubmitButton>
              </div>
            </ActionForm>
          </Cell>
        )}
      </Ruled>
    </>
  );
}
