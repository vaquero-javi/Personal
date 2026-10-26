'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { container } from '@/server/container';
import { formObject, runAction, type ActionState } from '@/server/actions';
import { requirePermission } from '@/server/session';

export async function createPurchaseOrder(org: string, _: ActionState, formData: FormData): Promise<ActionState> {
  let id = '';
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'purchasing.write');
    id = await container().purchasing.create(ctx, formObject(formData));
    revalidatePath(`/o/${org}`, 'layout');
  });
  if (result.ok) redirect(`/o/${org}/compras/pedidos/${id}`);
  return result;
}

export async function sendPurchaseOrder(org: string, id: string, _: ActionState, _formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'purchasing.write');
    await container().purchasing.send(ctx, id);
    revalidatePath(`/o/${org}`, 'layout');
    return 'Pedido marcado como enviado al proveedor';
  });
}

export async function cancelPurchaseOrder(org: string, id: string, _: ActionState, _formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'purchasing.write');
    await container().purchasing.cancel(ctx, id);
    revalidatePath(`/o/${org}`, 'layout');
    return 'Pedido anulado';
  });
}

export async function receivePurchaseOrder(org: string, id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  let receiptId = '';
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'inventory.write');
    receiptId = await container().purchasing.receive(ctx, id, String(formData.get('supplierDeliveryNote') ?? ''));
    revalidatePath(`/o/${org}`, 'layout');
  });
  if (result.ok) redirect(`/o/${org}/almacen/albaranes/${receiptId}`);
  return result;
}
