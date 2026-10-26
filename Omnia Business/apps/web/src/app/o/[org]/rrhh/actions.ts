'use server';

import { revalidatePath } from 'next/cache';
import { container } from '@/server/container';
import { flag, formObject, runAction, type ActionState } from '@/server/actions';
import { requireOrg, requirePermission } from '@/server/session';
import { entryType } from '@/lib/labels';
import { DomainError } from '@omnia/core';
import { toPayslipFile } from '@omnia/hr';

const revalidate = (org: string) => revalidatePath(`/o/${org}`, 'layout');

export async function clock(
  org: string,
  payload: { entryType: 'clock_in' | 'clock_out' | 'break_start' | 'break_end'; latitude?: number; longitude?: number; accuracy?: number; geoConsent: boolean },
): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'hr.time.self');
    await container().hr.clock(ctx, { ...payload, source: 'web' });
    revalidate(org);
    return `${entryType[payload.entryType]} registrada`;
  });
}

export async function manualEntry(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'hr.time.manage');
    await container().hr.manualEntry(ctx, formObject(formData));
    revalidate(org);
    return 'Fichaje manual registrado con su motivo';
  });
}

export async function createShift(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'hr.shifts.manage');
    await container().hr.createShift(ctx, formObject(formData));
    revalidate(org);
    return 'Turno creado';
  });
}

export async function deleteShift(org: string, id: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'hr.shifts.manage');
    await container().hr.deleteShift(ctx, id);
    revalidate(org);
  });
}

export async function requestLeave(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'hr.leave.request');
    await container().hr.requestLeave(ctx, { ...formObject(formData), halfDay: flag(formData, 'halfDay') });
    revalidate(org);
    return 'Solicitud enviada';
  });
}

export async function reviewLeave(org: string, id: string, decision: 'approved' | 'rejected' | 'cancelled', _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = decision === 'cancelled' ? await requireOrg(org) : await requirePermission(org, 'hr.leave.approve');
    await container().hr.reviewLeave(ctx, id, decision);
    revalidate(org);
    return { approved: 'Solicitud aprobada', rejected: 'Solicitud rechazada', cancelled: 'Solicitud cancelada' }[decision];
  });
}

export async function uploadPayslip(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'hr.payroll.manage');
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) throw new DomainError('VALIDATION', 'Adjunta el PDF de la nómina');
    await container().payroll.upload(ctx, formObject(formData), toPayslipFile(file.name, new Uint8Array(await file.arrayBuffer())));
    revalidatePath(`/o/${org}/rrhh/nominas`, 'layout');
    return 'Nómina subida: ya la puede ver su titular';
  });
}

export async function deletePayslip(org: string, id: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'hr.payroll.manage');
    await container().payroll.remove(ctx, id);
    revalidatePath(`/o/${org}/rrhh/nominas`, 'layout');
    return 'Nómina borrada';
  });
}
