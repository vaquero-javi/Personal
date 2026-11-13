'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { container } from '@/server/container';
import { FEATURES } from '@/server/features';
import { flag, formObject, runAction, type ActionState } from '@/server/actions';
import { requirePermission } from '@/server/session';
import { readDeliveryNote } from '@/server/delivery-note-reader';
import { DomainError } from '@omnia/core';
import { matchDeliveryNote, toReceiptDocument, type DeliveryNoteScan } from '@omnia/inventory';

const path = (org: string, rest = '') => `/o/${org}/almacen${rest}`;

export async function saveItem(org: string, id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  let savedId = id;
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'inventory.write', FEATURES.inventory);
    const input = formObject(formData);
    savedId = await container().warehouse.saveItem(ctx, { ...input, isActive: id ? flag(formData, 'isActive') : true }, id ?? undefined);
    revalidatePath(path(org), 'layout');
  });
  if (result.ok && !id) redirect(path(org, `/articulos/${savedId}`));
  return { ...result, ...(result.ok ? { message: 'Artículo guardado' } : {}) };
}

export async function createWarehouse(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'inventory.write', FEATURES.warehouses);
    await container().warehouse.createWarehouse(ctx, formObject(formData));
    revalidatePath(path(org, '/almacenes'));
    return 'Almacén creado';
  });
}

export async function setWarehouseEstablishment(org: string, warehouseId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'inventory.write', FEATURES.warehouses);
    await container().warehouse.setWarehouseEstablishment(ctx, { warehouseId, establishmentId: formData.get('establishmentId') });
    revalidatePath(path(org, '/almacenes'));
    return 'Empresa del almacén guardada';
  });
}

export async function setMinimum(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'inventory.write', FEATURES.inventory);
    await container().warehouse.setMinimum(ctx, formObject(formData));
    revalidatePath(path(org), 'layout');
    return 'Mínimo actualizado';
  });
}

export async function adjustStock(org: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'inventory.post', FEATURES.stockMovements);
    await container().warehouse.adjust(ctx, formObject(formData));
    revalidatePath(path(org), 'layout');
    return formData.get('kind') === 'transfer' ? 'Traspaso registrado' : 'Ajuste registrado';
  });
}

export async function createReceipt(org: string, _: ActionState, formData: FormData): Promise<ActionState> {
  let id = '';
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'inventory.write', FEATURES.goodsReceipts);
    const input = formObject(formData);
    const photo = formData.get('photo');
    const document = photo instanceof File && photo.size > 0 ? toReceiptDocument(photo.name, new Uint8Array(await photo.arrayBuffer())) : undefined;
    const receipt = await container().goodsReceipts.create(
      ctx,
      { ...input, receivedAt: input.receivedAt || undefined, notes: input.notes || undefined },
      document,
    );
    id = receipt.id;
    revalidatePath(path(org), 'layout');
  });
  if (result.ok) redirect(path(org, `/albaranes/${id}`));
  return result;
}

export type ScanState = { ok: true; scan: DeliveryNoteScan } | { ok: false; error: string };

/**
 * Opción «escanear»: lee la foto del albarán y la empareja con proveedores y
 * artículos. No guarda nada; solo devuelve con qué rellenar el formulario.
 */
export async function scanReceipt(org: string, formData: FormData): Promise<ScanState> {
  let scan: DeliveryNoteScan | undefined;
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'inventory.write', FEATURES.goodsReceipts);
    const file = formData.get('photo');
    if (!(file instanceof File) || file.size === 0) throw new DomainError('VALIDATION', 'Elige o haz una foto del albarán');
    const [read, suppliers, items] = await Promise.all([
      readDeliveryNote(file),
      container().parties.list(ctx, { role: 'supplier' }),
      container().warehouse.items(ctx),
    ]);
    if (!read.isDeliveryNote) throw new DomainError('VALIDATION', 'La imagen no parece un albarán o no se lee bien. Prueba con otra foto, con buena luz y la hoja entera.');
    scan = matchDeliveryNote(read, {
      suppliers: suppliers.map((p) => ({ id: p.id, legalName: p.legalName, taxId: p.taxId })),
      items: items.filter((i) => i.isActive && i.itemType === 'stockable').map((i) => ({ id: i.id, sku: i.sku, barcode: i.barcode, name: i.name })),
    });
  });
  return result.ok && scan ? { ok: true, scan } : { ok: false, error: result.error ?? 'No se ha podido leer el albarán' };
}

export async function postReceipt(org: string, id: string, _: ActionState, _formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'inventory.post', FEATURES.goodsReceipts);
    const result = await container().goodsReceipts.post(ctx, id);
    revalidatePath(`/o/${org}`, 'layout');
    return result.alreadyPosted ? 'Este albarán ya estaba confirmado' : 'Albarán confirmado. El stock entrará al registrar la factura del proveedor';
  });
}

export async function cancelReceipt(org: string, id: string, _: ActionState, _formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'inventory.write', FEATURES.goodsReceipts);
    await container().warehouse.cancelReceipt(ctx, id);
    revalidatePath(`/o/${org}`, 'layout');
    return 'Albarán anulado';
  });
}

export async function convertStockUnit(org: string, itemId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requirePermission(org, 'inventory.post', FEATURES.inventory);
    await container().warehouse.convertStockUnit(ctx, { itemId, newUnit: formData.get('newUnit'), factor: formData.get('factor') });
    revalidatePath(`/o/${org}`, 'layout');
    return 'Unidad cambiada: existencias, coste, mínimos y escandallos convertidos';
  });
}
