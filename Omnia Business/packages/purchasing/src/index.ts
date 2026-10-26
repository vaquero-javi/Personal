import { z } from 'zod';
import { DomainError, decimalString, optionalIsoDate, optionalText, singleOrganization, type TenantContext } from '@omnia/core';
import { asRow, asRows, withTenant, type Sql } from '@omnia/db';

export type PurchaseOrderStatus = 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled';

export interface PurchaseOrderSummary {
  id: string;
  number: number;
  status: PurchaseOrderStatus;
  supplierName: string;
  warehouseName: string;
  orderDate: string;
  expectedOn: string | null;
  total: string;
  receivedPct: number;
}

export interface PurchaseOrderDetail extends PurchaseOrderSummary {
  supplierId: string;
  warehouseId: string;
  notes: string | null;
  lines: { id: string; lineNo: number; itemId: string; sku: string; itemName: string; unitOfMeasure: string; quantity: string; unitCost: string; receivedQuantity: string }[];
  receipts: { id: string; number: number; status: string; receivedAt: Date }[];
}

export const PurchaseOrderInput = z.object({
  supplierId: z.uuid('Elige un proveedor'),
  warehouseId: z.uuid('Elige un almacén'),
  expectedOn: optionalIsoDate(),
  notes: optionalText(),
  lines: z
    .array(
      z.object({
        itemId: z.uuid('Elige un artículo'),
        quantity: decimalString({ scale: 4, sign: 'positive' }),
        unitCost: decimalString({ scale: 6, sign: 'non-negative' }),
      }),
    )
    .min(1, 'Añade al menos una línea'),
});

export function createPurchasingService(sql: Sql) {
  return {
    async list(ctx: TenantContext, { status }: { status?: string } = {}): Promise<PurchaseOrderSummary[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<PurchaseOrderSummary>(await tx`
          select po.id, po.number::int, po.status, p.legal_name as supplier_name, w.name as warehouse_name,
                 po.order_date::text, po.expected_on::text,
                 coalesce(sum(l.quantity * l.unit_cost), 0)::numeric(18,2)::text as total,
                 coalesce(round(100 * sum(least(l.received_quantity, l.quantity)) / nullif(sum(l.quantity), 0)), 0)::int as received_pct
          from purchase_orders po
          join parties p on p.id = po.supplier_id
          join warehouses w on w.id = po.warehouse_id
          left join purchase_order_lines l on l.purchase_order_id = po.id
          where (${status ?? null}::text is null or po.status = ${status ?? null})
          group by po.id, p.legal_name, w.name
          order by (po.status in ('draft', 'sent', 'partially_received')) desc, po.order_date desc, po.number desc`),
      );
    },

    async get(ctx: TenantContext, id: string): Promise<PurchaseOrderDetail> {
      const poId = z.uuid().parse(id);
      return withTenant(sql, ctx, async (tx) => {
        const po = asRow<PurchaseOrderDetail>(await tx`
          select po.id, po.number::int, po.status, po.supplier_id, p.legal_name as supplier_name, po.warehouse_id, w.name as warehouse_name,
                 po.order_date::text, po.expected_on::text, po.notes,
                 coalesce((select sum(quantity * unit_cost) from purchase_order_lines where purchase_order_id = po.id), 0)::numeric(18,2)::text as total,
                 0 as received_pct
          from purchase_orders po join parties p on p.id = po.supplier_id join warehouses w on w.id = po.warehouse_id
          where po.id = ${poId}`);
        if (!po) throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
        po.lines = asRows(await tx`
          select l.id, l.line_no, l.item_id, i.sku, i.name as item_name, i.unit_of_measure, l.quantity::text, l.unit_cost::text, l.received_quantity::text
          from purchase_order_lines l join inventory_items i on i.id = l.item_id
          where l.purchase_order_id = ${poId} order by l.line_no`);
        po.receipts = asRows(await tx`
          select id, number::int, status, received_at from goods_receipts where purchase_order_id = ${poId} order by received_at`);
        const ordered = po.lines.reduce((s, l) => s + Number(l.quantity), 0);
        const received = po.lines.reduce((s, l) => s + Math.min(Number(l.receivedQuantity), Number(l.quantity)), 0);
        po.receivedPct = ordered ? Math.round((100 * received) / ordered) : 0;
        return po;
      });
    },

    async create(ctx: TenantContext, raw: unknown): Promise<string> {
      const input = PurchaseOrderInput.parse(raw);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [supplier] = await tx`select 1 from parties where id = ${input.supplierId} and is_supplier`;
        if (!supplier) throw new DomainError('VALIDATION', 'El tercero no está dado de alta como proveedor');
        const [po] = await tx<{ id: string }[]>`
          insert into purchase_orders (organization_id, supplier_id, warehouse_id, expected_on, notes)
          values (${orgId}, ${input.supplierId}, ${input.warehouseId}, ${input.expectedOn ?? null}, ${input.notes ?? null})
          returning id`;
        await tx`
          insert into purchase_order_lines ${tx(
            input.lines.map((l, i) => ({
              organization_id: orgId,
              purchase_order_id: po!.id,
              line_no: i + 1,
              item_id: l.itemId,
              quantity: l.quantity,
              unit_cost: l.unitCost,
            })),
            'organization_id', 'purchase_order_id', 'line_no', 'item_id', 'quantity', 'unit_cost',
          )}`;
        return po!.id;
      });
    },

    async send(ctx: TenantContext, id: string) {
      await transition(sql, ctx, id, ['draft'], 'sent', 'Solo se envían pedidos en borrador');
    },

    async cancel(ctx: TenantContext, id: string) {
      await transition(sql, ctx, id, ['draft', 'sent'], 'cancelled', 'Un pedido con mercancía recibida no se anula');
    },

    /**
     * Prepara la recepción: crea un albarán en borrador con lo pendiente de
     * cada línea. Al contabilizarlo, un trigger acumula lo recibido en el pedido.
     */
    async receive(ctx: TenantContext, id: string, supplierDeliveryNote: string): Promise<string> {
      const poId = z.uuid().parse(id);
      const note = z.string().trim().min(1, 'Indica el nº de albarán del proveedor').max(64).parse(supplierDeliveryNote);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [po] = await tx<{ status: string; supplier_id: string; warehouse_id: string }[]>`
          select status, supplier_id, warehouse_id from purchase_orders where id = ${poId} for update`;
        if (!po) throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
        if (!['sent', 'partially_received'].includes(po.status)) {
          throw new DomainError('INVALID_STATE', 'Solo se reciben pedidos enviados');
        }
        const pending = await tx<{ id: string; item_id: string; pending: string; unit_cost: string }[]>`
          select id, item_id, (quantity - received_quantity)::text as pending, unit_cost::text
          from purchase_order_lines where purchase_order_id = ${poId} and received_quantity < quantity order by line_no`;
        if (pending.length === 0) throw new DomainError('INVALID_STATE', 'No queda nada pendiente de recibir');
        const [receipt] = await tx<{ id: string }[]>`
          insert into goods_receipts (organization_id, warehouse_id, supplier_id, supplier_delivery_note, purchase_order_id)
          values (${orgId}, ${po.warehouse_id}, ${po.supplier_id}, ${note}, ${poId}) returning id`;
        await tx`
          insert into goods_receipt_lines ${tx(
            pending.map((l, i) => ({
              organization_id: orgId,
              receipt_id: receipt!.id,
              line_no: i + 1,
              item_id: l.item_id,
              quantity: l.pending,
              unit_cost: l.unit_cost,
              purchase_order_line_id: l.id,
            })),
            'organization_id', 'receipt_id', 'line_no', 'item_id', 'quantity', 'unit_cost', 'purchase_order_line_id',
          )}`;
        return receipt!.id;
      });
    },
  };
}

async function transition(sql: Sql, ctx: TenantContext, id: string, from: string[], to: string, message: string) {
  await withTenant(sql, ctx, async (tx) => {
    const rows = await tx`update purchase_orders set status = ${to} where id = ${z.uuid().parse(id)} and status in ${tx(from)} returning id`;
    if (rows.length === 0) throw new DomainError('INVALID_STATE', message);
  });
}

export type PurchasingService = ReturnType<typeof createPurchasingService>;
