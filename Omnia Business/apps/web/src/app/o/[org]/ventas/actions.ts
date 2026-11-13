'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { container } from '@/server/container';
import { flag, formObject, runAction, type ActionState } from '@/server/actions';
import { FEATURES } from '@/server/features';
import { requirePermission } from '@/server/session';

const revalidate = (org: string) => revalidatePath(`/o/${org}`, 'layout');

export async function createSalesOrder(org: string, _: ActionState, formData: FormData): Promise<ActionState> {
  let id = '';
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'sales.write');
    id = await container().sales.create(ctx, formObject(formData));
    revalidate(org);
  });
  if (result.ok) redirect(`/o/${org}/ventas/pedidos/${id}`);
  return result;
}

export async function confirmSalesOrder(org: string, id: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'sales.write');
    await container().sales.confirm(ctx, id);
    revalidate(org);
    return 'Pedido confirmado';
  });
}

export async function deliverSalesOrder(org: string, id: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'inventory.post');
    await container().sales.deliver(ctx, id);
    revalidate(org);
    return 'Pedido servido: la mercancía ha salido del almacén';
  });
}

export async function invoiceSalesOrder(org: string, id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  let invoiceId = '';
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'invoicing.issue');
    invoiceId = await container().sales.invoice(ctx, id, String(formData.get('seriesId') ?? ''));
    revalidate(org);
  });
  if (result.ok) redirect(`/o/${org}/facturacion/${invoiceId}`);
  return result;
}

export async function cancelSalesOrder(org: string, id: string, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'sales.write');
    await container().sales.cancel(ctx, id);
    revalidate(org);
    return 'Pedido anulado';
  });
}

export async function createPriceList(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'parties.write', FEATURES.salesPriceLists);
    await container().parties.createPriceList(ctx, { ...formObject(formData), isDefault: flag(formData, 'isDefault') });
    revalidate(org);
    return 'Tarifa creada';
  });
}

export async function setPrice(org: string, priceListId: string, itemId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'parties.write', FEATURES.salesPriceLists);
    await container().parties.setPrice(ctx, { priceListId, itemId, unitPrice: String(formData.get('unitPrice') ?? '') });
    revalidate(org);
    return 'Precio guardado';
  });
}
