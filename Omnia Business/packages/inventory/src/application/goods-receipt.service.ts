import { z } from 'zod';
import { DomainError, parseCustomFields, singleOrganization, type TenantContext } from '@omnia/core';
import {
  CreateGoodsReceiptInput,
  assertPostable,
  inLockOrder,
  type GoodsReceipt,
  type PostGoodsReceiptResult,
  type ReceiptDocument,
} from '../domain/goods-receipt';
import type { InventoryUnitOfWork } from './ports';

const ReceiptId = z.uuid();

export function createGoodsReceiptService(uow: InventoryUnitOfWork) {
  return {
    /**
     * Registra un albarán en borrador. No mueve stock. La foto o el PDF del
     * papel, si lo hay, se guarda en la misma transacción.
     */
    async create(ctx: TenantContext, rawInput: unknown, document?: ReceiptDocument): Promise<GoodsReceipt> {
      const input = CreateGoodsReceiptInput.parse(rawInput);
      const organizationId = singleOrganization(ctx);

      return uow.run(ctx, async ({ receipts, customFields }) => {
        const definitions = await customFields.definitions(organizationId, 'goods_receipt');
        const validatedCustomFields = parseCustomFields(definitions, input.customFields);

        if (!(await receipts.supplierExists(organizationId, input.supplierId))) {
          throw new DomainError('VALIDATION', 'El tercero no existe o no está dado de alta como proveedor');
        }
        const receipt = await receipts.insertDraft(organizationId, { ...input, customFields: validatedCustomFields });
        if (document) await receipts.attachDocument(organizationId, receipt.id, document);
        return receipt;
      });
    },

    /**
     * Contabiliza el albarán: da entrada al stock y lo cierra, todo o nada.
     *
     * Garantías:
     *  - Atomicidad: movimientos + saldo + cambio de estado en una transacción.
     *  - Concurrencia: la cabecera se bloquea (FOR UPDATE); el segundo
     *    "contabilizar" espera y luego ve `posted`.
     *  - Idempotencia: un reintento devuelve el resultado sin duplicar stock
     *    (y el índice único por línea lo impediría de todos modos).
     *  - Sin interbloqueos: los saldos se bloquean en orden de artículo.
     */
    async post(ctx: TenantContext, receiptId: unknown): Promise<PostGoodsReceiptResult> {
      const id = ReceiptId.parse(receiptId);
      singleOrganization(ctx);

      return uow.run(ctx, async ({ receipts, stock }) => {
        const receipt = await receipts.lockById(id);
        if (!receipt) throw new DomainError('NOT_FOUND', 'Albarán no encontrado');

        const lines = await receipts.linesForPosting(id);
        const itemIds = [...new Set(lines.map((line) => line.itemId))];

        if (receipt.status === 'posted') {
          const levels = await stock.levels(receipt.organizationId, receipt.warehouseId, itemIds);
          return { receipt, alreadyPosted: true, levels };
        }
        assertPostable(receipt, lines);

        await stock.record(
          inLockOrder(lines).map((line) => ({
            organizationId: receipt.organizationId,
            warehouseId: receipt.warehouseId,
            itemId: line.itemId,
            movementType: 'receipt',
            quantity: line.quantity,
            unitCost: line.unitCost,
            source: { type: 'goods_receipt', id: receipt.id, lineId: line.lineId },
            occurredAt: receipt.receivedAt,
          })),
        );

        const posted = await receipts.markPosted(id);
        const levels = await stock.levels(receipt.organizationId, receipt.warehouseId, itemIds);
        return { receipt: posted, alreadyPosted: false, levels };
      });
    },
  };
}

export type GoodsReceiptService = ReturnType<typeof createGoodsReceiptService>;
