import { Cell, Facts, PageHeader, Ruled, StatusBadge } from '@/components/ui/layout';
import { ActionForm, SelectField, TextAreaField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { TaskStatusButtons } from '@/features/tasks/task-status-buttons';
import { formatDate, formatDateTime } from '@/lib/format';
import { taskStatus } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { deleteTask, updateTask } from '../actions';

export const metadata = { title: 'Tarea · Omnia' };

export default async function TaskPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const { ctx, can } = await requireOrg(org);
  const manager = can('tasks.manage');
  const [task, people] = await Promise.all([container().tasks.get(ctx, id), manager ? container().hr.people(ctx) : Promise.resolve([])]);

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{task.title} <StatusBadge map={taskStatus} value={task.status} /></span>}
        description={`Mandada por ${task.assignedByName} el ${formatDateTime(task.createdAt)}`}
        back={{ href: `/o/${org}/tareas`, label: 'Tareas' }}
      />
      <Ruled cols="xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell title="Tarea">
          {task.description ? <p className="max-w-prose text-sm whitespace-pre-line">{task.description}</p> : <p className="text-sm text-ink-3">Sin detalles.</p>}
          <div className="mt-5 border-t border-line pt-4">
            <Facts
              items={[
                ['Para', task.assigneeName],
                ['Fecha límite', task.dueDate ? formatDate(task.dueDate) : null],
                ['Hecha', task.completedAt ? formatDateTime(task.completedAt) : null],
              ]}
            />
          </div>
          {(task.assigneeUserId === ctx.userId || manager) && (
            <div className="mt-5 flex justify-start">
              <TaskStatusButtons org={org} id={task.id} status={task.status} />
            </div>
          )}
        </Cell>
        {manager && (
          <Cell title="Editar">
            <ActionForm action={updateTask.bind(null, org, task.id)} className="flex flex-col gap-3">
              <TextField label="Tarea" name="title" required maxLength={200} defaultValue={task.title} />
              <TextAreaField label="Detalles" name="description" rows={4} maxLength={5000} defaultValue={task.description ?? ''} />
              <SelectField label="Para" name="assigneeUserId" required defaultValue={task.assigneeUserId} options={people.map((p) => ({ value: p.userId, label: p.name }))} />
              <TextField label="Fecha límite" name="dueDate" type="date" defaultValue={task.dueDate ?? ''} />
              <div>
                <SubmitButton>Guardar</SubmitButton>
              </div>
            </ActionForm>
            <ActionForm action={deleteTask.bind(null, org, task.id)} confirm="¿Borrar esta tarea? No se puede deshacer." className="mt-5 border-t border-line pt-4">
              <SubmitButton variant="danger">Borrar tarea</SubmitButton>
            </ActionForm>
          </Cell>
        )}
      </Ruled>
    </>
  );
}
