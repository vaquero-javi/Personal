import { Cell, PageHeader } from '@/components/ui/layout';
import { ActionForm, SelectField, TextAreaField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { container } from '@/server/container';
import { requirePermission } from '@/server/session';
import { createTask } from '../actions';

export const metadata = { title: 'Nueva tarea · Omnia' };

export default async function NewTaskPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requirePermission(org, 'tasks.manage');
  const people = await container().hr.people(ctx);
  return (
    <>
      <PageHeader title="Nueva tarea" description="Solo la verá la persona a la que se la mandes (y los responsables)." back={{ href: `/o/${org}/tareas`, label: 'Tareas' }} />
      <Cell>
        <ActionForm action={createTask.bind(null, org)} className="flex max-w-3xl flex-col gap-4">
          <TextField label="Tarea" name="title" required maxLength={200} placeholder="Reponer las neveras de la barra antes de abrir" />
          <TextAreaField label="Detalles" name="description" rows={4} maxLength={5000} placeholder="Qué hay que hacer, dónde y cualquier cosa que deba saber" />
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField label="Para" name="assigneeUserId" required options={people.map((p) => ({ value: p.userId, label: p.name }))} placeholder="Elige una persona" />
            <TextField label="Fecha límite" name="dueDate" type="date" hint="Opcional" />
          </div>
          <div>
            <SubmitButton pendingLabel="Mandando…">Mandar tarea</SubmitButton>
          </div>
        </ActionForm>
      </Cell>
    </>
  );
}
