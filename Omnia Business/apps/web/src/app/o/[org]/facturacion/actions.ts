'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { container } from '@/server/container';
import { formObject, runAction, type ActionState } from '@/server/actions';
import { requirePermission } from '@/server/session';

const revalidate = (org: string) => revalidatePath(`/o/${org}`, 'layout');

export async function createInvoice(org: string, direction: 'issued' | 'received', _: ActionState, formData: FormData): Promise<ActionState> {
  let id = '';
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'invoicing.write');
    id = await container().invoicing.createDraft(ctx, { ...formObject(formData), direction });
    revalidate(org);
  });
  if (result.ok) redirect(direction === 'issued' ? `/o/${org}/facturacion/${id}` : `/o/${org}/compras/facturas/${id}`);
  return result;
}

/**
 * Editor de facturas emitidas: guarda el borrador (nuevo o existente) y, si se
 * pulsó «Emitir factura», lo emite en la misma transacción.
 */
export async function saveInvoice(org: string, draftId: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  let id = '';
  const issue = formData.get('intent') === 'issue';
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'invoicing.write');
    if (issue) await requirePermission(org, 'invoicing.issue');
    const data = formObject(formData);
    id = await container().invoicing.saveDraft(
      ctx,
      { ...data, direction: 'issued' },
      { ...(draftId ? { id: draftId } : {}), ...(issue ? { issueNow: { seriesId: data.seriesId, issueDate: data.issueDate } } : {}) },
    );
    revalidate(org);
  });
  if (result.ok) redirect(`/o/${org}/facturacion/${id}`);
  return result;
}

export async function issueInvoice(org: string, id: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'invoicing.issue');
    await container().invoicing.issue(ctx, id, String(formData.get('seriesId') ?? ''), String(formData.get('issueDate') ?? ''));
    revalidate(org);
    return 'Factura emitida: numerada y con su huella VeriFactu encadenada';
  });
}

export async function deleteInvoiceDraft(org: string, id: string, _: ActionState, _formData: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'invoicing.write');
    await container().invoicing.deleteDraft(ctx, id);
    revalidate(org);
  });
  if (result.ok) redirect(`/o/${org}/facturacion`);
  return result;
}

export async function registerPayment(org: string, id: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'invoicing.write');
    await container().invoicing.registerPayment(ctx, { ...formObject(formData), invoiceId: id });
    revalidate(org);
    return 'Pago registrado';
  });
}

export async function createRectifying(org: string, id: string, _: ActionState, _formData: FormData): Promise<ActionState> {
  let newId = '';
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'invoicing.write');
    newId = await container().invoicing.createRectifying(ctx, id);
    revalidate(org);
  });
  if (result.ok) redirect(`/o/${org}/facturacion/${newId}`);
  return result;
}

export async function requeueFiscal(org: string, id: string, _: ActionState, _formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'invoicing.issue');
    await container().invoicing.requeueFiscal(ctx, id);
    revalidate(org);
    return 'Registro devuelto a la cola de envío a la AEAT';
  });
}

export async function createSeries(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'invoicing.issue');
    await container().invoicing.createSeries(ctx, formObject(formData));
    revalidate(org);
    return 'Serie creada';
  });
}
