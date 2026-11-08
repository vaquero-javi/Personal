'use server';

import { revalidatePath } from 'next/cache';
import { container } from '@/server/container';
import { flag, formObject, runAction, type ActionState } from '@/server/actions';
import { requireOrg, requirePermission } from '@/server/session';

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

export async function deleteRole(org: string, id: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'roles.delete');
    const replacementId = formData.get('replacementId');
    await container().organizations.deleteRole(ctx, id, typeof replacementId === 'string' && replacementId ? replacementId : null);
    revalidate(org);
    return 'Rol eliminado';
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

// ------------------------------------------------------------------ Tarjetas de empleado

export async function saveStaffPolicy(org: string, roleId: string | null, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'staff_cards.manage');
    const raw = formObject(formData);
    const optional = (v: unknown) => (v === undefined || v === '' ? null : v);
    await container().staffCards.savePolicy(ctx, {
      roleId,
      discountPct: raw.discountPct,
      maxUsesPerDay: optional(raw.maxUsesPerDay),
      monthlyDiscountCap: optional(raw.monthlyDiscountCap),
      requirePin: flag(formData, 'requirePin'),
      allowSelfService: flag(formData, 'allowSelfService'),
      isActive: !flag(formData, 'disabled'),
    });
    revalidate(org);
    return 'Descuento guardado: los pases se actualizan solos';
  });
}

export async function issueStaffCard(org: string, userId: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'staff_cards.manage');
    await container().staffCards.issue(ctx, { userId, wallet: 'apple' }); // tarjeta estándar: QR fijo y definitivo
    revalidate(org);
    return 'Tarjeta emitida: la persona ya la ve en «Tu tarjeta»';
  });
}

export async function revokeStaffCard(org: string, cardId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'staff_cards.manage');
    await container().staffCards.revoke(ctx, cardId, { reason: formData.get('reason') || 'Revocada desde el backoffice' });
    revalidate(org);
    // El aviso al móvil sale en segundo plano; el TPV ya la rechaza.
    void container().staffCards.processWalletUpdates(20).catch(() => undefined);
    return 'Tarjeta revocada: deja de valer en el TPV desde ya';
  });
}

/** QR del momento de una tarjeta propia (para enseñarla en la pantalla, sin wallet). */
export async function myCardQr(org: string, cardId: string) {
  const { ctx } = await requireOrg(org);
  return container().staffCards.currentQr(ctx, cardId);
}

export async function googleWalletLink(org: string, cardId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let url = '';
  const state = await runAction(async () => {
    const { ctx } = await requireOrg(org);
    url = await container().staffCards.googleSaveUrl(ctx, cardId);
  });
  return state.ok ? { ok: true, url } : { ok: false, error: state.error ?? 'No se pudo generar el enlace' };
}
