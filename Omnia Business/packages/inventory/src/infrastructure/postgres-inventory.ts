import { CustomFieldDefinition, type TenantContext } from '@omnia/core';
import { withTenant, type Sql, type Tx } from '@omnia/db';
import { GoodsReceipt, StockLevelSnapshot, type ReceiptLineToPost } from '../domain/goods-receipt';
import type {
  CustomFieldCatalog,
  GoodsReceiptRepository,
  InventoryRepositories,
  InventoryUnitOfWork,
  StockLedger,
} from '../application/ports';

// Todas las consultas corren dentro de withTenant(): RLS filtra por
// organización y permiso, así que aquí no se repite `organization_id = …`
// salvo donde forma parte de la clave (FKs compuestas, índices).

const RECEIPT_COLUMNS = [
  'id',
  'organization_id',
  'number',
  'warehouse_id',
  'supplier_id',
  'supplier_delivery_note',
  'status',
  'received_at',
  'posted_at',
] as const;

interface ReceiptRow {
  id: string;
  organization_id: string;
  number: string; // bigint → string en postgres.js
  warehouse_id: string;
  supplier_id: string;
  supplier_delivery_note: string;
  status: string;
  received_at: Date;
  posted_at: Date | null;
}

const toReceipt = (row: ReceiptRow): GoodsReceipt =>
  GoodsReceipt.parse({
    id: row.id,
    organizationId: row.organization_id,
    number: Number(row.number),
    warehouseId: row.warehouse_id,
    supplierId: row.supplier_id,
    supplierDeliveryNote: row.supplier_delivery_note,
    status: row.status,
    receivedAt: row.received_at,
    postedAt: row.posted_at,
  });

function goodsReceiptRepository(tx: Tx): GoodsReceiptRepository {
  return {
    async supplierExists(organizationId, supplierId) {
      const rows = await tx`
        select 1 from parties
        where organization_id = ${organizationId} and id = ${supplierId} and is_supplier
      `;
      return rows.length > 0;
    },

    async insertDraft(organizationId, input) {
      const [header] = await tx<ReceiptRow[]>`
        insert into goods_receipts
          (organization_id, warehouse_id, supplier_id, supplier_delivery_note, received_at, notes, custom_fields)
        values (
          ${organizationId}, ${input.warehouseId}, ${input.supplierId}, ${input.supplierDeliveryNote},
          ${input.receivedAt ?? new Date()}, ${input.notes ?? null}, ${tx.json(input.customFields as never)}
        )
        returning ${tx(RECEIPT_COLUMNS)}
      `;
      if (!header) throw new Error('INSERT sin RETURNING');

      const lines = input.lines.map((line, index) => ({
        organization_id: organizationId,
        receipt_id: header.id,
        line_no: index + 1,
        item_id: line.itemId,
        quantity: line.quantity,
        unit_cost: line.unitCost,
      }));
      await tx`
        insert into goods_receipt_lines
        ${tx(lines, 'organization_id', 'receipt_id', 'line_no', 'item_id', 'quantity', 'unit_cost')}
      `;
      return toReceipt(header);
    },

    async attachDocument(organizationId, receiptId, document) {
      await tx`
        insert into goods_receipt_documents (organization_id, receipt_id, content_type, file_name, byte_size, content)
        values (${organizationId}, ${receiptId}, ${document.contentType}, ${document.fileName},
                ${document.content.byteLength}, ${Buffer.from(document.content.buffer, document.content.byteOffset, document.content.byteLength)})
      `;
    },

    async lockById(id) {
      const [row] = await tx<ReceiptRow[]>`
        select ${tx(RECEIPT_COLUMNS)} from goods_receipts where id = ${id} for update
      `;
      return row ? toReceipt(row) : null;
    },

    async linesForPosting(receiptId) {
      const rows = await tx<{ id: string; item_id: string; quantity: string; unit_cost: string }[]>`
        select id, item_id, quantity, unit_cost
        from goods_receipt_lines
        where receipt_id = ${receiptId}
        order by line_no
      `;
      return rows.map(
        (row): ReceiptLineToPost => ({ lineId: row.id, itemId: row.item_id, quantity: row.quantity, unitCost: row.unit_cost }),
      );
    },

    async markPosted(id) {
      const [row] = await tx<ReceiptRow[]>`
        update goods_receipts
        set status = 'posted', posted_at = now(), posted_by = app.current_user_id()
        where id = ${id} and status = 'draft'
        returning ${tx(RECEIPT_COLUMNS)}
      `;
      if (!row) throw new Error(`El albarán ${id} no estaba en borrador al cerrarlo`);
      return toReceipt(row);
    },
  };
}

function stockLedger(tx: Tx): StockLedger {
  return {
    async record(movements) {
      if (movements.length === 0) return;
      // Un solo INSERT multi-fila: los triggers se disparan por fila en este
      // orden, que es el orden de bloqueo que decidió el dominio.
      const rows = movements.map((m) => ({
        organization_id: m.organizationId,
        warehouse_id: m.warehouseId,
        item_id: m.itemId,
        movement_type: m.movementType,
        quantity: m.quantity,
        unit_cost: m.unitCost,
        source_type: m.source?.type ?? null,
        source_id: m.source?.id ?? null,
        source_line_id: m.source?.lineId ?? null,
        occurred_at: m.occurredAt,
      }));
      await tx`
        insert into stock_movements
        ${tx(rows, 'organization_id', 'warehouse_id', 'item_id', 'movement_type', 'quantity', 'unit_cost',
             'source_type', 'source_id', 'source_line_id', 'occurred_at')}
      `;
    },

    async levels(organizationId, warehouseId, itemIds) {
      if (itemIds.length === 0) return [];
      const rows = await tx<
        { warehouse_id: string; item_id: string; on_hand: string; min_quantity: string; below_minimum: boolean }[]
      >`
        select warehouse_id, item_id, on_hand, min_quantity, on_hand <= min_quantity as below_minimum
        from stock_levels
        where organization_id = ${organizationId}
          and warehouse_id = ${warehouseId}
          and item_id in ${tx(itemIds as string[])}
        order by item_id
      `;
      return rows.map((row) =>
        StockLevelSnapshot.parse({
          warehouseId: row.warehouse_id,
          itemId: row.item_id,
          onHand: row.on_hand,
          minQuantity: row.min_quantity,
          belowMinimum: row.below_minimum,
        }),
      );
    },
  };
}

function customFieldCatalog(tx: Tx): CustomFieldCatalog {
  return {
    async definitions(organizationId, entity) {
      const rows = await tx<{ key: string; data_type: string; is_required: boolean; options: unknown }[]>`
        select key, data_type, is_required, options
        from custom_field_definitions
        where organization_id = ${organizationId} and entity = ${entity}
        order by position, key
      `;
      return rows.map((row) =>
        CustomFieldDefinition.parse({
          key: row.key,
          dataType: row.data_type,
          isRequired: row.is_required,
          options: row.options,
        }),
      );
    },
  };
}

export function createPostgresInventoryUnitOfWork(sql: Sql): InventoryUnitOfWork {
  return {
    run<T>(ctx: TenantContext, work: (repos: InventoryRepositories) => Promise<T>) {
      return withTenant(sql, ctx, (tx) =>
        work({
          receipts: goodsReceiptRepository(tx),
          stock: stockLedger(tx),
          customFields: customFieldCatalog(tx),
        }),
      );
    },
  };
}
