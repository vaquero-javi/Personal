import { Cell, EmptyState, PageHeader, Ruled, StatusBadge } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, CheckboxField, SelectField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { leaveStatus, leaveType } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { requestLeave, reviewLeave } from '../actions';

export const metadata = { title: 'Vacaciones y permisos · Omnia' };

export default async function LeavePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can } = await requireOrg(org);
  const leaves = await container().hr.leaves(ctx);
  const mine = leaves.filter((l) => l.userId === ctx.userId);
  const toReview = can('hr.leave.approve') ? leaves.filter((l) => l.userId !== ctx.userId && l.status === 'requested') : [];
  const team = can('hr.leave.approve') ? leaves.filter((l) => l.userId !== ctx.userId && l.status === 'approved') : [];
  const year = String(new Date().getFullYear());
  const usedVacation = mine.filter((l) => l.status === 'approved' && l.leaveType === 'vacation' && l.startsOn.startsWith(year)).reduce((s, l) => s + l.days, 0);

  return (
    <>
      <PageHeader title="Vacaciones y permisos" description={`Has disfrutado o tienes aprobados ${usedVacation} días de vacaciones este año.`} />
      {toReview.length > 0 && (
        <Cell title={`Pendientes de tu aprobación (${toReview.length})`}>
          <Table minWidth={720}>
            <thead>
              <tr>
                <Th>Persona</Th>
                <Th>Tipo</Th>
                <Th>Fechas</Th>
                <Th align="right">Días</Th>
                <Th>Motivo</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {toReview.map((l) => (
                <Tr key={l.id}>
                  <Td className="font-medium">{l.userName}</Td>
                  <Td>{leaveType[l.leaveType]}</Td>
                  <Td className="text-ink-2">{formatDate(l.startsOn)}{l.endsOn !== l.startsOn && ` – ${formatDate(l.endsOn)}`}</Td>
                  <Td align="right">{l.days}</Td>
                  <Td className="text-ink-2">{l.reason ?? '—'}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <ActionForm action={reviewLeave.bind(null, org, l.id, 'approved')}><SubmitButton className="h-8 px-3">Aprobar</SubmitButton></ActionForm>
                      <ActionForm action={reviewLeave.bind(null, org, l.id, 'rejected')}><SubmitButton variant="danger" className="h-8 px-3">Rechazar</SubmitButton></ActionForm>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Cell>
      )}
      <Ruled cols="lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell title="Mis solicitudes">
          {mine.length === 0 ? (
            <EmptyState title="No has pedido ninguna ausencia">Tus solicitudes aparecerán aquí con su estado.</EmptyState>
          ) : (
            <Table minWidth={560}>
              <thead>
                <tr>
                  <Th>Tipo</Th>
                  <Th>Fechas</Th>
                  <Th align="right">Días</Th>
                  <Th>Estado</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {mine.map((l) => (
                  <Tr key={l.id}>
                    <Td>{leaveType[l.leaveType]}</Td>
                    <Td className="text-ink-2">{formatDate(l.startsOn)}{l.endsOn !== l.startsOn && ` – ${formatDate(l.endsOn)}`}</Td>
                    <Td align="right">{l.days}</Td>
                    <Td>
                      <StatusBadge map={leaveStatus} value={l.status} />
                      {l.reviewedByName && <span className="block text-xs text-ink-3">por {l.reviewedByName}</span>}
                    </Td>
                    <Td>
                      {l.status === 'requested' && (
                        <ActionForm action={reviewLeave.bind(null, org, l.id, 'cancelled')}>
                          <SubmitButton variant="ghost" className="h-8 px-2">Cancelar</SubmitButton>
                        </ActionForm>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          {team.length > 0 && (
            <>
              <h4 className="mt-6 mb-2 text-sm font-bold">Ausencias aprobadas del equipo</h4>
              <ul className="divide-y divide-line-soft text-sm">
                {team.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3 py-2">
                    <span>{l.userName} · {leaveType[l.leaveType]}</span>
                    <span className="text-ink-2">{formatDate(l.startsOn)}{l.endsOn !== l.startsOn && ` – ${formatDate(l.endsOn)}`}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cell>
        <Cell title="Nueva solicitud">
          {can('hr.leave.request') ? (
            <ActionForm action={requestLeave.bind(null, org)} className="flex flex-col gap-3" resetOnSuccess>
              <SelectField label="Tipo" name="leaveType" options={Object.entries(leaveType).map(([value, label]) => ({ value, label }))} />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Desde" name="startsOn" type="date" required />
                <TextField label="Hasta" name="endsOn" type="date" required />
              </div>
              <CheckboxField label="Medio día" name="halfDay" />
              <TextField label="Motivo" name="reason" placeholder="Opcional" />
              <div>
                <SubmitButton>Enviar solicitud</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-ink-2">Tu rol no solicita ausencias en esta sociedad.</p>
          )}
        </Cell>
      </Ruled>
    </>
  );
}
