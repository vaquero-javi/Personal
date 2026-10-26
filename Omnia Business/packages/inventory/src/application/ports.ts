import type { CustomFieldDefinition, CustomFieldEntity, TenantContext } from '@omnia/core';
import type {
  CreateGoodsReceiptInput,
  GoodsReceipt,
  ReceiptDocument,
  ReceiptLineToPost,
  StockLevelSnapshot,
} from '../domain/goods-receipt';

export interface NewStockMovement {
  organizationId: string;
  warehouseId: string;
  itemId: string;
  movementType: 'receipt' | 'issue' | 'sale' | 'return' | 'adjustment' | 'transfer_in' | 'transfer_out';
  quantity: string;
  unitCost: string | null;
  source: { type: 'goods_receipt' | 'invoice' | 'sale' | 'adjustment' | 'transfer'; id: string; lineId: string } | null;
  occurredAt: Date;
}

export interface GoodsReceiptRepository {
  supplierExists(organizationId: string, supplierId: string): Promise<boolean>;
  insertDraft(organizationId: string, input: CreateGoodsReceiptInput): Promise<GoodsReceipt>;
  attachDocument(organizationId: string, receiptId: string, document: ReceiptDocument): Promise<void>;
  /** SELECT … FOR UPDATE: bloquea la cabecera hasta el final de la transacción. */
  lockById(id: string): Promise<GoodsReceipt | null>;
  linesForPosting(receiptId: string): Promise<ReceiptLineToPost[]>;
  /** posted_by lo fija Postgres con app.current_user_id(), no el llamante. */
  markPosted(id: string): Promise<GoodsReceipt>;
}

export interface StockLedger {
  /** Inserta en el libro; el saldo (stock_levels) lo actualiza Postgres en la misma transacción. */
  record(movements: readonly NewStockMovement[]): Promise<void>;
  levels(organizationId: string, warehouseId: string, itemIds: readonly string[]): Promise<StockLevelSnapshot[]>;
}

export interface CustomFieldCatalog {
  definitions(organizationId: string, entity: CustomFieldEntity): Promise<CustomFieldDefinition[]>;
}

export interface InventoryRepositories {
  receipts: GoodsReceiptRepository;
  stock: StockLedger;
  customFields: CustomFieldCatalog;
}

/** Ejecuta `work` en UNA transacción ACID con el contexto del tenant. */
export interface InventoryUnitOfWork {
  run<T>(ctx: TenantContext, work: (repos: InventoryRepositories) => Promise<T>): Promise<T>;
}
