'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { DomainError } from '@omnia/core';
import { matchSupplierInvoice, type SupplierInvoiceScan } from '@omnia/purchasing';
import { normalizeTaxId } from '@omnia/inventory';
import type { ItemOption } from '@/components/ui/line-items';
import type { CreateResult, NewItemInput, NewSupplierInput } from '@/features/purchasing/create-from-scan';
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

/** Mensaje de error de una acción que devuelve datos (no un ActionState de formulario). */
async function attempt<T>(work: () => Promise<T>): Promise<CreateResult<T>> {
  let value: T | undefined;
  const result = await runAction(async () => {
    value = await work();
  });
  return result.ok ? { ok: true, value: value as T } : { ok: false, error: result.error ?? 'No se ha podido guardar' };
}

/**
 * Factura o albarán leído de una foto: el proveedor no está dado de alta. Lo crea
 * con la razón social y el CIF leídos (revisados por la persona). Si ya existía
 * ese CIF solo como cliente, lo marca también como proveedor en vez de duplicarlo.
 */
export async function createSupplierFromScan(org: string, input: NewSupplierInput): Promise<CreateResult<{ value: string; label: string }>> {
  return attempt(async () => {
    const { ctx } = await requirePermission(org, 'parties.write', FEATURES.parties);
    const legalName = input.legalName.trim();
    const taxId = input.taxId.trim() ? normalizeTaxId(input.taxId) : '';
    if (taxId) {
      const existing = (await container().parties.list(ctx)).find((p) => p.taxId && normalizeTaxId(p.taxId) === taxId);
      if (existing) {
        if (!existing.isSupplier) await container().parties.markSupplier(ctx, existing.id);
        revalidatePath(`/o/${org}`, 'layout');
        return { value: existing.id, label: existing.legalName };
      }
    }
    const id = await container().parties.save(ctx, { legalName, taxId, isCustomer: false, isSupplier: true, paymentTermsDays: 30 });
    revalidatePath(`/o/${org}`, 'layout');
    return { value: id, label: legalName };
  });
}

/** Referencia libre para un artículo nuevo: la leída, o ART-0001, ART-0002… la primera que no exista. */
function freeSku(wanted: string, taken: Set<string>): string {
  const clean = wanted.trim().toUpperCase().slice(0, 40);
  if (clean && !taken.has(clean)) return clean;
  if (clean) throw new DomainError('CONFLICT', `Ya hay un artículo con la referencia «${clean}». Elígelo en la línea o pon otra referencia.`);
  for (let n = taken.size + 1; ; n++) {
    const sku = `ART-${String(n).padStart(4, '0')}`;
    if (!taken.has(sku)) return sku;
  }
}

/**
 * Factura o albarán leído de una foto: una línea no corresponde a ningún
 * artículo del almacén. Lo da de alta (almacenable) con lo leído y revisado; al
 * registrar la factura entra en stock con su cantidad y su coste.
 */
export async function createItemFromScan(org: string, input: NewItemInput): Promise<CreateResult<ItemOption>> {
  return attempt(async () => {
    const { ctx } = await requirePermission(org, 'inventory.write', FEATURES.inventory);
    const existing = await container().warehouse.items(ctx);
    const barcode = input.barcode.trim();
    const sameBarcode = barcode ? existing.find((i) => i.barcode === barcode) : undefined;
    if (sameBarcode) throw new DomainError('CONFLICT', `Ese código de barras ya es de «${sameBarcode.name}». Elígelo en la línea.`);
    const sku = freeSku(input.sku, new Set(existing.map((i) => i.sku.toUpperCase())));
    const unit = input.unit.trim() || 'ud';
    const taxRate = input.taxRate.replace(',', '.').trim();
    const id = await container().warehouse.saveItem(ctx, {
      sku,
      barcode,
      name: input.name.trim(),
      itemType: 'stockable',
      unitOfMeasure: unit,
      purchasePackSize: '1',
      defaultTaxRate: taxRate,
      isActive: true,
    });
    revalidatePath(`/o/${org}`, 'layout');
    return { id, sku, name: input.name.trim(), unit, taxRate };
  });
}
