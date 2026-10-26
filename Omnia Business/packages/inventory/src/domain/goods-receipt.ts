import { z } from 'zod';
import { DomainError, MAX_UPLOAD_BYTES, decimalString, toStoredFile, type FileType, type StoredFile } from '@omnia/core';

// ---------------------------------------------------------------------------
// Contratos (compartidos con el cliente vía `@omnia/inventory/contracts`)
// ---------------------------------------------------------------------------

export const GoodsReceiptStatus = z.enum(['draft', 'posted', 'cancelled']);
export type GoodsReceiptStatus = z.infer<typeof GoodsReceiptStatus>;

export const GoodsReceiptLineInput = z.object({
  itemId: z.uuid('Elige el artículo'),
  quantity: decimalString({ scale: 4, sign: 'positive' }),
  unitCost: decimalString({ scale: 6, sign: 'non-negative' }),
});
export type GoodsReceiptLineInput = z.infer<typeof GoodsReceiptLineInput>;

export const CreateGoodsReceiptInput = z.object({
  warehouseId: z.uuid(),
  supplierId: z.uuid(),
  supplierDeliveryNote: z.string().trim().min(1, 'Indica el nº de albarán del proveedor').max(64),
  receivedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).optional(),
  customFields: z.record(z.string(), z.unknown()).default({}),
  lines: z.array(GoodsReceiptLineInput).min(1, 'El albarán necesita al menos una línea').max(500),
});
export type CreateGoodsReceiptInput = z.infer<typeof CreateGoodsReceiptInput>;

// `coerce.date` permite usar el mismo esquema para filas de Postgres (Date) y respuestas JSON (string).
export const GoodsReceipt = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  number: z.number().int().positive(),
  warehouseId: z.uuid(),
  supplierId: z.uuid(),
  supplierDeliveryNote: z.string(),
  status: GoodsReceiptStatus,
  receivedAt: z.coerce.date(),
  postedAt: z.coerce.date().nullable(),
});
export type GoodsReceipt = z.infer<typeof GoodsReceipt>;

export const StockLevelSnapshot = z.object({
  warehouseId: z.uuid(),
  itemId: z.uuid(),
  onHand: z.string(),
  minQuantity: z.string(),
  belowMinimum: z.boolean(),
});
export type StockLevelSnapshot = z.infer<typeof StockLevelSnapshot>;

export const PostGoodsReceiptResult = z.object({
  receipt: GoodsReceipt,
  /** true si ya estaba contabilizado (reintento del cliente): no se ha movido stock. */
  alreadyPosted: z.boolean(),
  levels: z.array(StockLevelSnapshot),
});
export type PostGoodsReceiptResult = z.infer<typeof PostGoodsReceiptResult>;

// ---------------------------------------------------------------------------
// Reglas de dominio
// ---------------------------------------------------------------------------

export interface ReceiptLineToPost {
  lineId: string;
  itemId: string;
  quantity: string;
  unitCost: string;
}

export function assertPostable(receipt: Pick<GoodsReceipt, 'status' | 'number'>, lines: readonly ReceiptLineToPost[]): void {
  if (receipt.status === 'cancelled') {
    throw new DomainError('INVALID_STATE', `El albarán ${receipt.number} está anulado`);
  }
  if (lines.length === 0) {
    throw new DomainError('VALIDATION', `El albarán ${receipt.number} no tiene líneas`);
  }
}

/**
 * Orden canónico de bloqueo: por artículo. Dos albaranes concurrentes que
 * comparten artículos bloquean las filas de `stock_levels` en el mismo orden y
 * no pueden provocar un interbloqueo entre sí.
 */
export function inLockOrder(lines: readonly ReceiptLineToPost[]): ReceiptLineToPost[] {
  return [...lines].sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Justificante: foto o PDF del albarán en papel
// ---------------------------------------------------------------------------

export const RECEIPT_DOCUMENT_MAX_BYTES = MAX_UPLOAD_BYTES;

export type ReceiptDocumentType = FileType;
export type ReceiptDocument = StoredFile<ReceiptDocumentType>;

/** Valida el archivo subido y lo deja listo para guardar. */
export const toReceiptDocument = (fileName: string, content: Uint8Array): ReceiptDocument =>
  toStoredFile(fileName, content, {
    allowed: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
    what: 'del albarán',
    fallbackName: 'albaran',
  });
