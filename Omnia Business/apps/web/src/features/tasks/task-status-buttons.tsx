import type { TaskStatus } from '@omnia/tasks/types';
import { ActionForm } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { setTaskStatus } from '@/app/o/[org]/tareas/actions';

/** Botones para avanzar una tarea: empezarla, terminarla o reabrirla. */
export function TaskStatusButtons({ org, id, status }: { org: string; id: string; status: TaskStatus }) {
  const next: [TaskStatus, string, 'primary' | 'secondary'][] =
    status === 'pending'
      ? [['in_progress', 'Empezar', 'secondary'], ['done', 'Hecha', 'primary']]
      : status === 'in_progress'
        ? [['done', 'Hecha', 'primary']]
        : [['pending', 'Reabrir', 'secondary']];
  return (
    <div className="flex justify-end gap-2">
      {next.map(([value, label, variant]) => (
        <ActionForm key={value} action={setTaskStatus.bind(null, org, id, value)}>
          <SubmitButton variant={variant} className="h-8 px-3">{label}</SubmitButton>
        </ActionForm>
      ))}
    </div>
  );
}
