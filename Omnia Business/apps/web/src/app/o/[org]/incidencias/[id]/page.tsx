import { Cell, Facts, PageHeader, Ruled, StatusBadge } from '@/components/ui/layout';
import { ActionForm, SelectField, TextAreaField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { formatDateTime, initials } from '@/lib/format';
import { incidentPriority, incidentStatus } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { commentIncident, updateIncident } from '../actions';

export default async function IncidentPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const { ctx, can } = await requireOrg(org);
  const [inc, people] = await Promise.all([container().incidents.get(ctx, id), container().hr.people(ctx)]);
  const canEdit = can('incidents.manage') || (can('incidents.write') && inc.assigneeUserId === ctx.userId);

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">#{inc.number} · {inc.title} <StatusBadge map={incidentStatus} value={inc.status} /> <StatusBadge map={incidentPriority} value={inc.priority} /></span>}
        description={`Abierta por ${inc.reportedByName} el ${formatDateTime(inc.createdAt)}`}
        back={{ href: `/o/${org}/incidencias`, label: 'Incidencias' }}
      />
      <Ruled cols="xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell title="Conversación">
          {inc.description && <p className="mb-5 max-w-prose text-sm whitespace-pre-line">{inc.description}</p>}
          <ol className="flex flex-col gap-4">
            {inc.comments.map((c) => (
              <li key={c.id} className="flex gap-3">
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-carton text-xs font-semibold text-ink-2">{initials(c.authorName)}</span>
                <div className="min-w-0">
                  <p className="text-xs text-ink-3"><b className="text-ink">{c.authorName}</b> · {formatDateTime(c.createdAt)}</p>
                  <p className="mt-0.5 max-w-prose text-sm whitespace-pre-line">{c.body}</p>
                </div>
              </li>
            ))}
          </ol>
          {can('incidents.write') && (
            <ActionForm action={commentIncident.bind(null, org, inc.id)} className="mt-5 flex flex-col gap-3 border-t border-line pt-4" resetOnSuccess>
              <TextAreaField label="Añadir comentario" name="body" rows={3} required />
              <div>
                <SubmitButton pendingLabel="Enviando…">Comentar</SubmitButton>
              </div>
            </ActionForm>
          )}
        </Cell>
        <Cell title="Gestión">
          <Facts
            items={[
              ['Sobre', inc.subjectName ? `${inc.subjectName} (${inc.subjectKind === 'party' ? 'tercero' : 'empleado'})` : null],
              ['Categoría', inc.category],
              ['Asignada a', inc.assigneeName ?? 'Sin asignar'],
              ['Resuelta', inc.resolvedAt ? formatDateTime(inc.resolvedAt) : null],
            ]}
          />
          {canEdit ? (
            <ActionForm action={updateIncident.bind(null, org, inc.id)} className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
              <SelectField label="Estado" name="status" defaultValue={inc.status} options={Object.entries(incidentStatus).map(([value, [label]]) => ({ value, label }))} />
              <SelectField label="Prioridad" name="priority" defaultValue={inc.priority} options={Object.entries(incidentPriority).map(([value, [label]]) => ({ value, label }))} />
              <SelectField
                label="Asignada a"
                name="assigneeUserId"
                defaultValue={inc.assigneeUserId ?? ''}
                options={people.map((p) => ({ value: p.userId, label: p.name }))}
                placeholder="Sin asignar"
                disabled={!can('incidents.manage')}
                hint={can('incidents.manage') ? undefined : 'Solo un responsable reasigna'}
              />
              {!can('incidents.manage') && <input type="hidden" name="assigneeUserId" value={inc.assigneeUserId ?? ''} />}
              <div>
                <SubmitButton>Guardar</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="mt-5 border-t border-line pt-4 text-sm text-ink-2">La gestiona quien la tiene asignada o un responsable.</p>
          )}
        </Cell>
      </Ruled>
    </>
  );
}
