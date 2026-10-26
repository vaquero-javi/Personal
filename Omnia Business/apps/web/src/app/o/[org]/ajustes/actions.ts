'use server';

import { revalidatePath } from 'next/cache';
import { container } from '@/server/container';
import { flag, formObject, runAction, type ActionState } from '@/server/actions';
import { requirePermission } from '@/server/session';

const revalidate = (org: string) => revalidatePath('/', 'layout');

export async function updateOrganization(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'org.manage');
    await container().organizations.update(ctx, formObject(formData));
    revalidate(org);
    return 'Datos de la sociedad guardados';
  });
}

export async function addMember(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'members.manage');
    await container().organizations.addMember(ctx, formObject(formData));
    revalidate(org);
    return 'Miembro añadido';
  });
}

export async function updateMember(org: string, userId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'members.manage');
    await container().organizations.updateMember(ctx, { ...formObject(formData), userId });
    revalidate(org);
    return 'Cambios guardados';
  });
}

export async function saveRole(org: string, id: string | null, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'roles.manage');
    const permissions = formData.getAll('permissions').map(String);
    await container().organizations.saveRole(ctx, { id: id ?? '', name: formData.get('name'), permissions });
    revalidate(org);
    return id ? 'Rol actualizado' : 'Rol creado';
  });
}

export async function createCustomField(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'org.manage');
    const options = String(formData.get('options') ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    await container().organizations.createCustomField(ctx, { ...formObject(formData), options, isRequired: flag(formData, 'isRequired') });
    revalidate(org);
    return 'Campo creado';
  });
}

export async function deleteCustomField(org: string, id: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'org.manage');
    await container().organizations.deleteCustomField(ctx, id);
    revalidate(org);
  });
}
