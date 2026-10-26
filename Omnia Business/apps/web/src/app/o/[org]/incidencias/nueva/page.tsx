import { Cell, PageHeader } from '@/components/ui/layout';
import { ActionForm, SelectField, TextAreaField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { incidentPriority } from '@/lib/labels';
import { container } from '@/server/container';
import { requirePermission } from '@/server/session';
import { createIncident } from '../actions';

export const metadata = { title: 'Nueva incidencia · Omnia' };

export default async function NewIncidentPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can } = await requirePermission(org, 'incidents.write');
  const [people, parties] = await Promise.all([
    container().hr.people(ctx),
    can('parties.read') ? container().parties.list(ctx) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="Abrir incidencia" back={{ href: `/o/${org}/incidencias`, label: 'Incidencias' }} />
      <Cell>
        <ActionForm action={createIncident.bind(null, org)} className="flex max-w-3xl flex-col gap-4">
          <TextField label="Título" name="title" required placeholder="Palé dañado en la recepción de esta mañana" />
          <TextAreaField label="Descripción" name="description" rows={4} placeholder="Qué ha pasado, dónde y qué se ha hecho ya" />
          <div className="grid gap-4 md:grid-cols-3">
            <SelectField label="Prioridad" name="priority" defaultValue="normal" options={Object.entries(incidentPriority).map(([value, [label]]) => ({ value, label }))} />
            <TextField label="Categoría" name="category" placeholder="Almacén, Ventas, RRHH…" />
            <SelectField label="Asignar a" name="assigneeUserId" options={people.map((p) => ({ value: p.userId, label: p.name }))} placeholder="Sin asignar" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {parties.length > 0 && <SelectField label="Cliente o proveedor afectado" name="partyId" options={parties.map((p) => ({ value: p.id, label: p.legalName }))} placeholder="Ninguno" />}
            <SelectField label="Empleado afectado" name="employeeUserId" options={people.map((p) => ({ value: p.userId, label: p.name }))} placeholder="Ninguno" />
          </div>
          <div>
            <SubmitButton pendingLabel="Abriendo…">Abrir incidencia</SubmitButton>
          </div>
        </ActionForm>
      </Cell>
    </>
  );
}
