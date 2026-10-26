'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { container } from '@/server/container';
import { formObject, runAction, type ActionState } from '@/server/actions';
import { requirePermission } from '@/server/session';

export async function createIncident(org: string, _: ActionState, formData: FormData): Promise<ActionState> {
  let id = '';
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'incidents.write');
    id = await container().incidents.create(ctx, formObject(formData));
    revalidatePath(`/o/${org}`, 'layout');
  });
  if (result.ok) redirect(`/o/${org}/incidencias/${id}`);
  return result;
}

export async function updateIncident(org: string, id: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'incidents.write');
    await container().incidents.update(ctx, id, formObject(formData));
    revalidatePath(`/o/${org}`, 'layout');
    return 'Incidencia actualizada';
  });
}

export async function commentIncident(org: string, id: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'incidents.write');
    await container().incidents.comment(ctx, id, formData.get('body'));
    revalidatePath(`/o/${org}/incidencias/${id}`);
  });
}
