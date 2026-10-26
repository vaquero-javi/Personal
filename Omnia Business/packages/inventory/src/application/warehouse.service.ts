import { z } from 'zod';
import {
  DomainError,
  CustomFieldDefinition,
  decimalString,
  parseCustomFields,
  optionalText,
  requiredText,
  singleOrganization,
  type TenantContext,
} from '@omnia/core';
import { asRow, asRows, withTenant, type Sql } from '@omnia/db';

// Artículos, almacenes, existencias y movimientos manuales (ajustes y
// traspasos). Los albaranes viven en goods-receipt.service.ts.

export interface Item {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  itemType: 'stockable' | 'consumable' | 'service';
  unitOfMeasure: string;
  defaultTaxRate: string;
  isActive: boolean;
  customFields: Record<string, unknown>;
}

export interface ItemSummary extends Item {
  onHand: string;
  minQuantity: string;
  belowMinimum: boolean;
  avgUnitCost: string;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  itemCount: number;
  stockValue: string;
}

export interface StockLevel {
  warehouseId: string;
  warehouseName: string;
  itemId: string;
  sku: string;
  itemName: string;
  unitOfMeasure: string;
  onHand: string;
  reserved: string;
  minQuantity: string;
  avgUnitCost: string;
  belowMinimum: boolean;
}

export interface Movement {
  id: string;
  occurredAt: Date;
  movementType: string;
  quantity: string;
  unitCost: string | null;
  sku: string;
  itemName: string;
  warehouseName: string;
  sourceType: string | null;
  sourceId: string | null;
  note: string | null;
  createdByName: string | null;
}

export interface ReceiptSummary {
  id: string;
  number: number;
  status: 'draft' | 'posted' | 'cancelled';
  supplierName: string;
  supplierDeliveryNote: string;
  warehouseName: string;
  receivedAt: Date;
  postedAt: Date | null;
  lineCount: number;
  totalCost: string;
  purchaseOrderNumber: number | null;
}

export interface ReceiptDetail extends ReceiptSummary {
  supplierId: string;
  warehouseId: string;
  notes: string | null;
  postedByName: string | null;
  /** Foto o PDF del albarán en papel; el contenido se sirve aparte. */
  document: { fileName: string; contentType: string; byteSize: number } | null;
  lines: { id: string; lineNo: number; itemId: string; sku: string; itemName: string; unitOfMeasure: string; quantity: string; unitCost: string }[];
}

export const ItemInput = z.object({
  sku: requiredText(40),
  barcode: optionalText(40),
  name: requiredText(200),
  itemType: z.enum(['stockable', 'consumable', 'service']),
  unitOfMeasure: requiredText(20),
  defaultTaxRate: decimalString({ scale: 2, sign: 'non-negative' }),
  isActive: z.boolean().default(true),
  customFields: z.record(z.string(), z.unknown()).default({}),
});

export const WarehouseInput = z.object({ code: requiredText(10), name: requiredText(80) });

export const StockAdjustmentInput = z
  .object({
    kind: z.enum(['adjustment', 'transfer']),
    itemId: z.uuid('Elige un artículo'),
    warehouseId: z.uuid('Elige un almacén'),
    toWarehouseId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
    quantity: decimalString({ scale: 4 }),
    unitCost: z.preprocess((v) => (v === '' ? undefined : v), decimalString({ scale: 6, sign: 'non-negative' }).optional()),
    note: requiredText(300, 'Indica el motivo'),
  })
  .refine((v) => v.quantity !== '0' && Number(v.quantity) !== 0, { message: 'La cantidad no puede ser cero', path: ['quantity'] })
  .refine((v) => v.kind === 'adjustment' || (v.toWarehouseId && v.toWarehouseId !== v.warehouseId), {
    message: 'Elige un almacén de destino distinto',
    path: ['toWarehouseId'],
  })
  .refine((v) => v.kind === 'adjustment' || !v.quantity.startsWith('-'), { message: 'Un traspaso mueve una cantidad positiva', path: ['quantity'] });

export const SetMinimumInput = z.object({
  warehouseId: z.uuid(),
  itemId: z.uuid(),
  minQuantity: decimalString({ scale: 4, sign: 'non-negative' }),
});

export function createWarehouseService(sql: Sql) {
  return {
    async items(ctx: TenantContext, { search, onlyBelowMinimum = false }: { search?: string; onlyBelowMinimum?: boolean } = {}): Promise<ItemSummary[]> {
      const term = search?.trim() ? `%${search.trim()}%` : null;
      return withTenant(sql, ctx, async (tx) =>
        asRows<ItemSummary>(await tx`
          select i.id, i.sku, i.barcode, i.name, i.item_type, i.unit_of_measure, i.default_tax_rate::text, i.is_active, i.custom_fields,
                 coalesce(sum(sl.on_hand), 0)::text as on_hand,
                 coalesce(sum(sl.min_quantity), 0)::text as min_quantity,
                 coalesce(bool_or(sl.on_hand <= sl.min_quantity and sl.min_quantity > 0), false) as below_minimum,
                 coalesce(max(sl.avg_unit_cost), 0)::text as avg_unit_cost
          from inventory_items i
          left join stock_levels sl on sl.item_id = i.id
          where (${term}::text is null or i.name ilike ${term} or i.sku ilike ${term} or i.barcode = ${search?.trim() ?? null})
          group by i.id
          having (not ${onlyBelowMinimum}) or coalesce(bool_or(sl.on_hand <= sl.min_quantity and sl.min_quantity > 0), false)
          order by i.is_active desc, i.name`),
      );
    },

    async item(ctx: TenantContext, id: string): Promise<{ item: Item; levels: StockLevel[]; movements: Movement[] }> {
      const itemId = z.uuid().parse(id);
      return withTenant(sql, ctx, async (tx) => {
        const item = asRow<Item>(await tx`
          select id, sku, barcode, name, item_type, unit_of_measure, default_tax_rate::text, is_active, custom_fields
          from inventory_items where id = ${itemId}`);
        if (!item) throw new DomainError('NOT_FOUND', 'Artículo no encontrado');
        const levels = asRows<StockLevel>(await tx`
          select w.id as warehouse_id, w.name as warehouse_name, i.id as item_id, i.sku, i.name as item_name, i.unit_of_measure,
                 coalesce(sl.on_hand, 0)::text as on_hand, coalesce(sl.reserved, 0)::text as reserved,
                 coalesce(sl.min_quantity, 0)::text as min_quantity, coalesce(sl.avg_unit_cost, 0)::text as avg_unit_cost,
                 coalesce(sl.on_hand <= sl.min_quantity and sl.min_quantity > 0, false) as below_minimum
          from warehouses w
          cross join inventory_items i
          left join stock_levels sl on sl.warehouse_id = w.id and sl.item_id = i.id
          where i.id = ${itemId} and w.is_active
          order by w.name`);
        const movements = await recentMovements(tx, { itemId, limit: 30 });
        return { item, levels, movements };
      });
    },

    async saveItem(ctx: TenantContext, raw: unknown, id?: string): Promise<string> {
      const input = ItemInput.parse(raw);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const definitions = (
          await tx<{ key: string; data_type: string; is_required: boolean; options: unknown }[]>`
            select key, data_type, is_required, options from custom_field_definitions
            where organization_id = ${orgId} and entity = 'inventory_item'`
        ).map((d) => CustomFieldDefinition.parse({ key: d.key, dataType: d.data_type, isRequired: d.is_required, options: d.options }));
        input.customFields = parseCustomFields(definitions, input.customFields);
        if (id) {
          const rows = await tx`
            update inventory_items set sku = ${input.sku}, barcode = ${input.barcode ?? null}, name = ${input.name},
              item_type = ${input.itemType}, unit_of_measure = ${input.unitOfMeasure}, default_tax_rate = ${input.defaultTaxRate},
              is_active = ${input.isActive}, custom_fields = ${tx.json(input.customFields as never)}
            where id = ${z.uuid().parse(id)} returning id`;
          if (rows.length === 0) throw new DomainError('NOT_FOUND', 'Artículo no encontrado');
          return id;
        }
        const [row] = await tx<{ id: string }[]>`
          insert into inventory_items (organization_id, sku, barcode, name, item_type, unit_of_measure, default_tax_rate, is_active, custom_fields)
          values (${orgId}, ${input.sku}, ${input.barcode ?? null}, ${input.name}, ${input.itemType}, ${input.unitOfMeasure},
                  ${input.defaultTaxRate}, ${input.isActive}, ${tx.json(input.customFields as never)})
          returning id`;
        return row!.id;
      });
    },

    async warehouses(ctx: TenantContext): Promise<Warehouse[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<Warehouse>(await tx`
          select w.id, w.code, w.name, w.is_active,
                 count(sl.item_id) filter (where sl.on_hand > 0)::int as item_count,
                 coalesce(sum(sl.on_hand * sl.avg_unit_cost), 0)::numeric(18,2)::text as stock_value
          from warehouses w left join stock_levels sl on sl.warehouse_id = w.id
          group by w.id order by w.name`),
      );
    },

    async createWarehouse(ctx: TenantContext, raw: unknown) {
      const input = WarehouseInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, (tx) => tx`insert into warehouses (organization_id, code, name) values (${orgId}, ${input.code.toUpperCase()}, ${input.name})`);
    },

    async stock(ctx: TenantContext, { warehouseId, onlyBelowMinimum = false }: { warehouseId?: string; onlyBelowMinimum?: boolean } = {}): Promise<StockLevel[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<StockLevel>(await tx`
          select sl.warehouse_id, w.name as warehouse_name, sl.item_id, i.sku, i.name as item_name, i.unit_of_measure,
                 sl.on_hand::text, sl.reserved::text, sl.min_quantity::text, sl.avg_unit_cost::text,
                 (sl.on_hand <= sl.min_quantity and sl.min_quantity > 0) as below_minimum
          from stock_levels sl
          join warehouses w on w.id = sl.warehouse_id
          join inventory_items i on i.id = sl.item_id
          where (${warehouseId ?? null}::uuid is null or sl.warehouse_id = ${warehouseId ?? null})
            and (not ${onlyBelowMinimum} or (sl.on_hand <= sl.min_quantity and sl.min_quantity > 0))
          order by (sl.on_hand <= sl.min_quantity and sl.min_quantity > 0) desc, i.name, w.name`),
      );
    },

    async setMinimum(ctx: TenantContext, raw: unknown) {
      const input = SetMinimumInput.parse(raw);
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`
          update stock_levels set min_quantity = ${input.minQuantity}
          where warehouse_id = ${input.warehouseId} and item_id = ${input.itemId} returning item_id`;
        if (rows.length === 0) throw new DomainError('VALIDATION', 'Este artículo aún no tiene existencias en ese almacén');
      });
    },

    async movements(ctx: TenantContext, filter: { itemId?: string; warehouseId?: string; limit?: number } = {}): Promise<Movement[]> {
      return withTenant(sql, ctx, (tx) => recentMovements(tx, { limit: 200, ...filter }));
    },

    /**
     * Ajuste (+/−) o traspaso entre almacenes. Un traspaso son dos movimientos
     * en la misma transacción: si la salida no tiene existencias, no hay entrada.
     */
    async adjust(ctx: TenantContext, raw: unknown) {
      const input = StockAdjustmentInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        if (input.kind === 'adjustment') {
          await tx`
            insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, unit_cost, source_type, source_id, note)
            values (${orgId}, ${input.warehouseId}, ${input.itemId}, 'adjustment', ${input.quantity},
                    ${input.unitCost ?? null}, 'adjustment', gen_random_uuid(), ${input.note})`;
          return;
        }
        const transferId = crypto.randomUUID();
        // Primero la salida (bloquea el saldo de origen y valida existencias).
        const [out] = await tx<{ unit_cost: string | null }[]>`
          insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, source_type, source_id, note)
          values (${orgId}, ${input.warehouseId}, ${input.itemId}, 'transfer_out', ${'-' + input.quantity}, 'transfer', ${transferId}, ${input.note})
          returning unit_cost::text`;
        await tx`
          insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, unit_cost, source_type, source_id, note)
          values (${orgId}, ${input.toWarehouseId!}, ${input.itemId}, 'transfer_in', ${input.quantity}, ${out?.unit_cost ?? null}, 'transfer', ${transferId}, ${input.note})`;
      });
    },

    async receipts(ctx: TenantContext, { status }: { status?: string } = {}): Promise<ReceiptSummary[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<ReceiptSummary>(await tx`
          select gr.id, gr.number::int, gr.status, p.legal_name as supplier_name, gr.supplier_delivery_note, w.name as warehouse_name,
                 gr.received_at, gr.posted_at, count(l.id)::int as line_count,
                 coalesce(sum(l.quantity * l.unit_cost), 0)::numeric(18,2)::text as total_cost,
                 po.number::int as purchase_order_number
          from goods_receipts gr
          join parties p on p.id = gr.supplier_id
          join warehouses w on w.id = gr.warehouse_id
          left join goods_receipt_lines l on l.receipt_id = gr.id
          left join purchase_orders po on po.id = gr.purchase_order_id
          where (${status ?? null}::text is null or gr.status = ${status ?? null})
          group by gr.id, p.legal_name, w.name, po.number
          order by (gr.status = 'draft') desc, gr.received_at desc`),
      );
    },

    async receipt(ctx: TenantContext, id: string): Promise<ReceiptDetail> {
      const receiptId = z.uuid().parse(id);
      return withTenant(sql, ctx, async (tx) => {
        const header = asRow<ReceiptDetail>(await tx`
          select gr.id, gr.number::int, gr.status, gr.supplier_id, p.legal_name as supplier_name, gr.supplier_delivery_note,
                 gr.warehouse_id, w.name as warehouse_name, gr.received_at, gr.posted_at, gr.notes,
                 u.full_name as posted_by_name, po.number::int as purchase_order_number,
                 0 as line_count, '0' as total_cost
          from goods_receipts gr
          join parties p on p.id = gr.supplier_id
          join warehouses w on w.id = gr.warehouse_id
          left join users u on u.id = gr.posted_by
          left join purchase_orders po on po.id = gr.purchase_order_id
          where gr.id = ${receiptId}`);
        if (!header) throw new DomainError('NOT_FOUND', 'Albarán no encontrado');
        header.lines = asRows(await tx`
          select l.id, l.line_no, l.item_id, i.sku, i.name as item_name, i.unit_of_measure, l.quantity::text, l.unit_cost::text
          from goods_receipt_lines l join inventory_items i on i.id = l.item_id
          where l.receipt_id = ${receiptId} order by l.line_no`);
        const [doc] = await tx<{ file_name: string; content_type: string; byte_size: number }[]>`
          select file_name, content_type, byte_size from goods_receipt_documents where receipt_id = ${receiptId}`;
        header.document = doc ? { fileName: doc.file_name, contentType: doc.content_type, byteSize: doc.byte_size } : null;
        header.lineCount = header.lines.length;
        header.totalCost = header.lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitCost), 0).toFixed(2);
        return header;
      });
    },

    async receiptDocument(ctx: TenantContext, id: string) {
      const receiptId = z.uuid().parse(id);
      return withTenant(sql, ctx, async (tx) => {
        const [doc] = await tx<{ file_name: string; content_type: string; content: Buffer }[]>`
          select file_name, content_type, content from goods_receipt_documents where receipt_id = ${receiptId}`;
        if (!doc) throw new DomainError('NOT_FOUND', 'Este albarán no tiene foto');
        return { fileName: doc.file_name, contentType: doc.content_type, content: doc.content };
      });
    },

    async cancelReceipt(ctx: TenantContext, id: string) {
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`update goods_receipts set status = 'cancelled' where id = ${z.uuid().parse(id)} and status = 'draft' returning id`;
        if (rows.length === 0) throw new DomainError('INVALID_STATE', 'Solo se anulan albaranes en borrador');
      });
    },
  };
}

async function recentMovements(
  tx: Parameters<Parameters<typeof withTenant>[2]>[0],
  { itemId, warehouseId, limit }: { itemId?: string; warehouseId?: string; limit: number },
): Promise<Movement[]> {
  return asRows<Movement>(await tx`
    select m.id, m.occurred_at, m.movement_type, m.quantity::text, m.unit_cost::text, i.sku, i.name as item_name,
           w.name as warehouse_name, m.source_type, m.source_id, m.note, u.full_name as created_by_name
    from stock_movements m
    join inventory_items i on i.id = m.item_id
    join warehouses w on w.id = m.warehouse_id
    left join users u on u.id = m.created_by
    where (${itemId ?? null}::uuid is null or m.item_id = ${itemId ?? null})
      and (${warehouseId ?? null}::uuid is null or m.warehouse_id = ${warehouseId ?? null})
    order by m.occurred_at desc, m.created_at desc
    limit ${limit}`);
}

export type WarehouseService = ReturnType<typeof createWarehouseService>;
