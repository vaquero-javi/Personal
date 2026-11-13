'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { DomainError } from '@omnia/core';
import { matchSupplierInvoice, type SupplierInvoiceScan } from '@omnia/purchasing';
import { container } from '@/server/container';
import { readSupplierInvoice } from '@/server/delivery-note-reader';
import { formObject, runAction, type ActionState } from '@/server/actions';
import { FEATURES } from '@/server/features';
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

export type InvoiceScanState = { ok: true; scan: SupplierInvoiceScan } | { ok: false; error: string };

/**
 * Registrar factura recibida con foto: lee la factura (foto o PDF) y la
 * empareja con proveedores y artículos. No guarda nada; solo devuelve con qué
 * rellenar el formulario, que la persona revisa antes de registrarla.
 */
export async function scanReceivedInvoice(org: string, formData: FormData): Promise<InvoiceScanState> {
  let scan: SupplierInvoiceScan | undefined;
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'invoicing.write', FEATURES.receivedInvoices);
    const file = formData.get('photo');
    if (!(file instanceof File) || file.size === 0) throw new DomainError('VALIDATION', 'Elige o haz una foto de la factura');
    const [read, suppliers, items] = await Promise.all([
      readSupplierInvoice(file),
      container().parties.list(ctx, { role: 'supplier' }),
      container().warehouse.items(ctx),
    ]);
    if (!read.isInvoice) throw new DomainError('VALIDATION', 'El documento no parece una factura o no se lee bien. Prueba con otra foto, con buena luz y la hoja entera.');
    scan = matchSupplierInvoice(read, {
      suppliers: suppliers.map((p) => ({ id: p.id, legalName: p.legalName, taxId: p.taxId })),
      items: items.filter((i) => i.isActive).map((i) => ({ id: i.id, sku: i.sku, barcode: i.barcode, name: i.name, taxRate: i.defaultTaxRate })),
    });
  });
  return result.ok && scan ? { ok: true, scan } : { ok: false, error: result.error ?? 'No se ha podido leer la factura' };
}
