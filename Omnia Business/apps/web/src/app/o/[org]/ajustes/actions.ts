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

// ------------------------------------------------------------------ TPV

/** Crea un terminal y devuelve su código de vinculación (solo se ve esta vez). */
export async function createPosTerminal(org: string, input: { name: string; warehouseId: string }) {
  const { ctx } = await requirePermission(org, 'pos.manage');
  let result: { code: string; expiresAt: Date } | null = null;
  const state = await runAction(async () => {
    result = await container().pos.createTerminal(ctx, input);
    revalidate(org);
  });
  return state.ok && result ? { ok: true as const, ...(result as { code: string; expiresAt: Date }) } : { ok: false as const, error: state.error ?? 'No se pudo crear' };
}

export async function newPosPairingCode(org: string, terminalId: string) {
  const { ctx } = await requirePermission(org, 'pos.manage');
  let result: { code: string; expiresAt: Date } | null = null;
  const state = await runAction(async () => {
    result = await container().pos.newPairingCode(ctx, terminalId);
    revalidate(org);
  });
  return state.ok && result ? { ok: true as const, ...(result as { code: string; expiresAt: Date }) } : { ok: false as const, error: state.error ?? 'No se pudo generar' };
}

export async function revokePosTerminal(org: string, terminalId: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'pos.manage');
    await container().pos.revokeTerminal(ctx, terminalId);
    revalidate(org);
    return 'Terminal desvinculado: tendrá que volver a vincularse con un código';
  });
}

export async function deletePosTerminal(org: string, terminalId: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'pos.manage');
    await container().pos.deleteTerminal(ctx, terminalId);
    revalidate(org);
    return 'Terminal borrado';
  });
}

export async function setStaffPin(org: string, userId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'pos.manage');
    await container().pos.setPin(ctx, userId, String(formData.get('pin') ?? ''));
    revalidate(org);
    return 'PIN guardado';
  });
}

export async function clearStaffPin(org: string, userId: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'pos.manage');
    await container().pos.clearPin(ctx, userId);
    revalidate(org);
    return 'PIN quitado';
  });
}

export async function savePosTable(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'pos.manage');
    await container().pos.saveTable(ctx, formObject(formData));
    revalidate(org);
    return formData.get('id') ? 'Mesa guardada' : 'Mesa creada';
  });
}

export async function removePosTable(org: string, tableId: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'pos.manage');
    const outcome = await container().pos.removeTable(ctx, tableId);
    revalidate(org);
    return outcome === 'deleted' ? 'Mesa borrada' : 'La mesa tiene histórico: se ha desactivado';
  });
}

export async function restorePosTable(org: string, tableId: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'pos.manage');
    await container().pos.setTableActive(ctx, tableId, true);
    revalidate(org);
    return 'Mesa reactivada';
  });
}

export async function savePosCategory(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'pos.manage');
    await container().pos.saveCategory(ctx, formObject(formData));
    revalidate(org);
    return formData.get('id') ? 'Categoría guardada' : 'Categoría creada';
  });
}

export async function removePosCategory(org: string, categoryId: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'pos.manage');
    await container().pos.removeCategory(ctx, categoryId);
    revalidate(org);
    return 'Categoría borrada: sus productos quedan fuera de carta';
  });
}

export async function setNegativeStock(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'org.manage');
    await container().pos.setAllowNegativeStock(ctx, flag(formData, 'allowNegativeStock'));
    revalidate(org);
    return 'Ajuste de stock guardado';
  });
}

export async function setPosTicketsVerifactu(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'org.manage');
    const enabled = formData.get('ticketsVerifactu') === 'on';
    await container().pos.setTicketsVerifactu(ctx, enabled);
    revalidate(org);
    return enabled ? 'Los tickets del TPV se registran en VeriFactu' : 'Los tickets del TPV salen como factura simplificada sin VeriFactu';
  });
}
