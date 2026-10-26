import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge, Cell, PageHeader, Ruled } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, SelectField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/button-styles';
import { addDays, capitalizeFirst, formatMinutes, formatTime, todayIso } from '@/lib/format';
import { entryType } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { manualEntry } from '../actions';

export const metadata = { title: 'Registro de jornada · Omnia' };

const longDay = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default async function TimesheetPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ fecha?: string }> }) {
  const { org } = await params;
  const { fecha } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  if (!can('hr.time.read')) redirect(`/o/${org}/rrhh`);
  const date = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : todayIso();
  const [rows, people] = await Promise.all([container().hr.day(ctx, date, 'all'), container().hr.people(ctx)]);
  const base = `/o/${org}/rrhh/registro`;
  const label = longDay.format(new Date(`${date}T00:00:00Z`));

  return (
    <>
      <PageHeader
        title="Registro de jornada"
        description={capitalizeFirst(label)}
        actions={
          <div className="flex items-center gap-1">
            <Link href={`${base}?fecha=${addDays(date, -1)}`} className={buttonClass('secondary', 'px-2')} aria-label="Día anterior"><ChevronLeft aria-hidden className="size-4" /></Link>
            <Link href={base} className={buttonClass('secondary')}>Hoy</Link>
            <Link href={`${base}?fecha=${addDays(date, 1)}`} className={buttonClass('secondary', 'px-2')} aria-label="Día siguiente"><ChevronRight aria-hidden className="size-4" /></Link>
          </div>
        }
      />
      <Ruled cols="xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <Cell>
          <Table minWidth={760}>
            <thead>
              <tr>
                <Th>Persona</Th>
                <Th>Turno</Th>
                <Th>Fichajes</Th>
                <Th align="right">Trabajado</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.userId} highlight={r.missing}>
                  <Td>
                    <span className="font-medium">{r.name}</span>
                    {r.employeeCode && <span className="block text-xs text-ink-3">{r.employeeCode}</span>}
                  </Td>
                  <Td className="text-ink-2">{r.shift ? `${formatTime(r.shift.startsAt)}–${formatTime(r.shift.endsAt)}${r.shift.area ? ` · ${r.shift.area}` : ''}` : '—'}</Td>
                  <Td>
                    {r.entries.length === 0 ? (
                      <span className="text-ink-3">—</span>
                    ) : (
                      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {r.entries.map((e) => (
                          <li key={e.id} title={e.correctionReason ?? undefined}>
                            <span className="text-ink-3">{entryType[e.entryType]}</span> <b>{formatTime(e.occurredAt)}</b>
                            {e.source === 'manual' && <span className="text-warning"> (manual)</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                  <Td align="right">{r.workedMinutes ? formatMinutes(r.workedMinutes) : '—'}</Td>
                  <Td>
                    {r.onLeave ? <Badge tone="info">Ausencia</Badge> : r.missing ? <Badge tone="danger">Sin fichar</Badge> : r.state === 'working' ? <Badge tone="ok">Trabajando</Badge> : r.state === 'on_break' ? <Badge tone="warning">En pausa</Badge> : <Badge tone="muted">Fuera</Badge>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Cell>
        <Cell title="Fichaje manual o corrección">
          {can('hr.time.manage') ? (
            <ActionForm action={manualEntry.bind(null, org)} className="flex flex-col gap-3" resetOnSuccess>
              <p className="text-sm text-ink-2">Se añade como fichaje nuevo con tu nombre y el motivo; el original no se toca.</p>
              <SelectField label="Persona" name="userId" options={people.map((p) => ({ value: p.userId, label: p.name }))} placeholder="Elige…" required />
              <SelectField label="Tipo" name="entryType" options={Object.entries(entryType).map(([value, label]) => ({ value, label }))} />
              <TextField label="Fecha y hora" name="occurredAt" type="datetime-local" defaultValue={`${date}T08:00`} required />
              <TextField label="Motivo" name="correctionReason" required placeholder="Olvidó fichar la entrada; confirmado con su responsable" />
              <div>
                <SubmitButton>Registrar</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-ink-2">Tu rol puede consultar el registro pero no corregirlo.</p>
          )}
        </Cell>
      </Ruled>
    </>
  );
}
