'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { container } from '@/server/container';
import { formObject, runAction, type ActionState } from '@/server/actions';
import { requireOrg, requirePermission } from '@/server/session';

export async function createTask(org: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'tasks.manage');
    await container().tasks.create(ctx, formObject(formData));
    revalidatePath(`/o/${org}`, 'layout');
  });
  if (result.ok) redirect(`/o/${org}/tareas`);
  return result;
}

export async function updateTask(org: string, id: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'tasks.manage');
    await container().tasks.update(ctx, id, formObject(formData));
    revalidatePath(`/o/${org}`, 'layout');
    return 'Tarea guardada';
  });
}

/** Cada persona marca las suyas; la RLS no deja tocar las de otros. */
export async function setTaskStatus(org: string, id: string, status: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requireOrg(org);
    await container().tasks.setStatus(ctx, id, status);
    revalidatePath(`/o/${org}`, 'layout');
    return status === 'done' ? 'Tarea hecha' : status === 'in_progress' ? 'Tarea empezada' : 'Tarea reabierta';
  });
}

export async function deleteTask(org: string, id: string, _: ActionState, _fd: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'tasks.manage');
    await container().tasks.remove(ctx, id);
    revalidatePath(`/o/${org}`, 'layout');
  });
  if (result.ok) redirect(`/o/${org}/tareas`);
  return result;
}
