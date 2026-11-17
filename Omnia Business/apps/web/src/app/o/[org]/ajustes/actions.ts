'use server';

import { revalidatePath } from 'next/cache';
import { DomainError } from '@omnia/core';
import { container } from '@/server/container';
import { flag, formObject, runAction, type ActionState } from '@/server/actions';
import { requireOrg, requirePermission } from '@/server/session';
import { FEATURES } from '@/server/features';
import { resolveAccount, sendAccessMail } from '@/server/invitations';

const revalidate = (org: string) => revalidatePath('/', 'layout');

export async function updateOrganization(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'org.manage', FEATURES.base);
    await container().organizations.update(ctx, formObject(formData));
    revalidate(org);
    return 'Datos de la sociedad guardados';
  });
}

/**
 * Alta por email: si la persona no tiene cuenta se crea y recibe una invitación
 * para poner su contraseña; si ya la usa, recibe un aviso. Ver server/invitations.ts.
 */
export async function addMember(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx, org: scope } = await requirePermission(org, 'members.manage', FEATURES.members);
    const organizations = container().organizations;
    const member = await organizations.prepareMember(ctx, formObject(formData));
    const account = await resolveAccount(member, scope.slug);
    await organizations.addMember(ctx, member, account.userId, account.status);
    revalidate(org);
    const me = await organizations.me(ctx.userId);
    const sent = await sendAccessMail({
      email: member.email,
      firstName: member.firstName,
      orgName: scope.tradeName ?? scope.legalName,
      roleName: member.roleName,
      invitedBy: me.fullName ?? me.email,
      account,
    }).catch((error: unknown) => {
      console.error('No se ha podido enviar el correo de acceso', error);
      return null;
    });
    if (sent === null) return `${member.fullName} añadido, pero no se ha podido enviar el correo. Usa «Reenviar invitación».`;
    if (!sent) return `${member.fullName} añadido. Correo sin enviar (falta configurar Gmail): el enlace está en la consola del servidor.`;
    return account.status === 'invited'
      ? `${member.fullName} añadido. Le hemos enviado un correo para activar su acceso.`
      : `${member.fullName} añadido. Ya tenía cuenta: le hemos avisado por correo.`;
  });
}

/** Borra de la sociedad a una persona suspendida (solo propietarios). */
export async function removeMember(org: string, userId: string, _: ActionState, __: FormData) {
  return runAction(async () => {
    const { ctx, can } = await requirePermission(org, 'members.manage', FEATURES.members);
    if (!can('*')) throw new DomainError('FORBIDDEN', 'Solo un propietario puede borrar miembros');
    await container().organizations.removeMember(ctx, userId);
    revalidate(org);
    return 'Miembro borrado';
  });
}

/** Vuelve a mandar la invitación a quien aún no ha activado su acceso (el enlace anterior deja de valer). */
export async function resendInvitation(org: string, userId: string, _: ActionState, __: FormData) {
  return runAction(async () => {
    const { ctx, org: scope } = await requirePermission(org, 'members.manage', FEATURES.members);
    const organizations = container().organizations;
    const member = await organizations.member(ctx, userId);
    if (member.status !== 'invited') return 'Esta persona ya ha activado su acceso';
    const fullName = member.fullName ?? member.email;
    const account = await resolveAccount({ email: member.email, fullName, existingUserId: member.userId }, scope.slug);
    const me = await organizations.me(ctx.userId);
    const sent = await sendAccessMail({
      email: member.email,
      firstName: fullName.split(' ')[0]!,
      orgName: scope.tradeName ?? scope.legalName,
      roleName: member.roleName,
      invitedBy: me.fullName ?? me.email,
      account,
    });
    return sent ? `Invitación reenviada a ${member.email}` : 'Correo sin enviar (falta configurar Gmail): el enlace está en la consola del servidor.';
  });
}

export async function updateMember(org: string, userId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'members.manage', FEATURES.members);
    await container().organizations.updateMember(ctx, { ...formObject(formData), userId });
    revalidate(org);
    return 'Cambios guardados';
  });
}

export async function saveRole(org: string, id: string | null, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'roles.manage', FEATURES.roles);
    const permissions = formData.getAll('permissions').map(String);
    await container().organizations.saveRole(ctx, { id: id ?? '', name: formData.get('name'), permissions });
    revalidate(org);
    return id ? 'Rol actualizado' : 'Rol creado';
  });
}

export async function deleteRole(org: string, id: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'roles.delete', FEATURES.roles);
    const replacementId = formData.get('replacementId');
    await container().organizations.deleteRole(ctx, id, typeof replacementId === 'string' && replacementId ? replacementId : null);
    revalidate(org);
    return 'Rol eliminado';
  });
}

export async function createCustomField(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'org.manage', FEATURES.customFields);
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
    const { ctx } = await requirePermission(org, 'org.manage', FEATURES.customFields);
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
    const { ctx } = await requirePermission(org, 'org.manage', FEATURES.base);
    await container().pos.setAllowNegativeStock(ctx, flag(formData, 'allowNegativeStock'));
    revalidate(org);
    return 'Ajuste de stock guardado';
  });
}

export async function setPosTicketsVerifactu(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'org.manage', FEATURES.base);
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

// ------------------------------------------------------------- carta del TPV

/** Coloca un artículo en la carta (o lo saca con categoría vacía) y fija su PVP. El TPV lo ve en segundos. */
export async function saveMenuItem(org: string, input: { itemId: string; categoryId: string | null; pvp: string }): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'pos.manage');
    await container().pos.saveMenuItem(ctx, input);
    revalidate(org);
    return input.categoryId ? 'Carta actualizada' : 'Producto fuera de carta';
  });
}

export async function createMenuItem(
  org: string,
  input: { name: string; categoryId: string; pvp: string; taxRate: string; kind: 'stock' | 'recipe' },
): Promise<ActionState & { id?: string }> {
  let id: string | undefined;
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'pos.manage');
    id = await container().pos.createMenuItem(ctx, input);
    revalidate(org);
    return 'Producto añadido a la carta';
  });
  return id ? { ...result, id } : result;
}

export async function saveRecipe(org: string, productId: string, lines: { ingredientId: string; quantity: string }[]): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'pos.manage');
    await container().recipes.save(ctx, { productId, lines });
    revalidate(org);
    return 'Escandallo guardado';
  });
}

// ------------------------------------------------------------------ grupo y empresas

export async function setOrganizationParent(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'org.manage', FEATURES.base);
    await container().organizations.setParent(ctx, formObject(formData));
    revalidate(org);
    return formData.get('parentId') ? 'Sociedad añadida al holding' : 'La sociedad ya no pertenece a ningún holding';
  });
}

export async function saveEstablishment(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'org.manage', FEATURES.establishments);
    const input = formObject(formData);
    await container().organizations.saveEstablishment(ctx, input);
    revalidate(org);
    return input.id ? 'Empresa guardada' : 'Empresa creada';
  });
}

export async function deleteEstablishment(org: string, id: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'org.manage', FEATURES.establishments);
    await container().organizations.deleteEstablishment(ctx, id);
    revalidate(org);
    return 'Empresa eliminada; sus almacenes siguen en la sociedad';
  });
}

export async function setEstablishmentMember(org: string, establishmentId: string, userId: string, assigned: boolean, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'members.manage', FEATURES.establishments);
    const person = userId || String(formData.get('userId') ?? '');
    await container().organizations.setEstablishmentMember(ctx, { establishmentId, userId: person, assigned: assigned ? 'on' : '' });
    revalidate(org);
    return assigned ? 'Persona añadida a la empresa' : 'Persona quitada de la empresa';
  });
}
