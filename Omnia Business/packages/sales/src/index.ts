import { z } from 'zod';
import { DomainError, decimalString, optionalText, singleOrganization, type TenantContext } from '@omnia/core';
import { asRow, asRows, withTenant, type Sql } from '@omnia/db';
import { insertLines } from '@omnia/invoicing';

export type SalesOrderStatus = 'draft' | 'confirmed' | 'delivered' | 'invoiced' | 'cancelled';

export interface SalesOrderSummary {
  id: string;
  number: number;
  status: SalesOrderStatus;
  customerName: string;
  warehouseName: string;
  orderDate: string;
  base: string;
  total: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
}

export interface SalesOrderDetail extends SalesOrderSummary {
  customerId: string;
  warehouseId: string;
  priceListName: string | null;
  notes: string | null;
  deliveredAt: Date | null;
  lines: {
    id: string;
    lineNo: number;
    itemId: string;
    sku: string;
    description: string;
    quantity: string;
    unitPrice: string;
    discountPct: string;
    taxRate: string;
    onHand: string;
  }[];
}

export interface PosProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  itemType: string;
  unitPrice: string;
  taxRate: string;
  onHand: string;
}

const OrderLine = z.object({
  itemId: z.uuid('Elige un artículo'),
  description: z.string().trim().min(1).max(300),
  quantity: decimalString({ scale: 4, sign: 'positive' }),
  unitPrice: decimalString({ scale: 4, sign: 'non-negative' }),
  discountPct: z.preprocess((v) => (v === '' || v === undefined ? '0' : v), decimalString({ scale: 2, sign: 'non-negative' })),
  taxRate: decimalString({ scale: 2, sign: 'non-negative' }),
});

export const SalesOrderInput = z.object({
  customerId: z.uuid('Elige un cliente'),
  warehouseId: z.uuid('Elige un almacén'),
  notes: optionalText(),
  lines: z.array(OrderLine).min(1, 'Añade al menos una línea'),
});

export const PosCheckoutInput = z.object({
  warehouseId: z.uuid(),
  method: z.enum(['cash', 'card']),
  /** Efectivo entregado, para calcular el cambio (opcional). */
  tendered: z.preprocess((v) => (v === '' ? undefined : v), decimalString({ scale: 2, sign: 'non-negative' }).optional()),
  lines: z
    .array(z.object({ itemId: z.uuid(), quantity: decimalString({ scale: 4, sign: 'positive' }) }))
    .min(1, 'El ticket está vacío'),
});

export function createSalesService(sql: Sql) {
  return {
    async list(ctx: TenantContext, { status }: { status?: string } = {}): Promise<SalesOrderSummary[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<SalesOrderSummary>(await tx`
          select so.id, so.number::int, so.status, p.legal_name as customer_name, w.name as warehouse_name, so.order_date::text,
                 coalesce(sum(round(l.quantity * l.unit_price * (1 - l.discount_pct / 100), 2)), 0)::text as base,
                 coalesce(sum(round(l.quantity * l.unit_price * (1 - l.discount_pct / 100), 2) * (1 + l.tax_rate / 100)), 0)::numeric(18,2)::text as total,
                 so.invoice_id, i.full_number as invoice_number
          from sales_orders so
          join parties p on p.id = so.customer_id
          join warehouses w on w.id = so.warehouse_id
          left join sales_order_lines l on l.sales_order_id = so.id
          left join invoices i on i.id = so.invoice_id
          where (${status ?? null}::text is null or so.status = ${status ?? null})
          group by so.id, p.legal_name, w.name, i.full_number
          order by (so.status in ('draft', 'confirmed', 'delivered')) desc, so.order_date desc, so.number desc`),
      );
    },

    async get(ctx: TenantContext, id: string): Promise<SalesOrderDetail> {
      const orderId = z.uuid().parse(id);
      return withTenant(sql, ctx, async (tx) => {
        const so = asRow<SalesOrderDetail>(await tx`
          select so.id, so.number::int, so.status, so.customer_id, p.legal_name as customer_name, so.warehouse_id, w.name as warehouse_name,
                 so.order_date::text, so.notes, so.delivered_at, pl.name as price_list_name, so.invoice_id, i.full_number as invoice_number,
                 '0' as base, '0' as total
          from sales_orders so
          join parties p on p.id = so.customer_id
          join warehouses w on w.id = so.warehouse_id
          left join price_lists pl on pl.id = so.price_list_id
          left join invoices i on i.id = so.invoice_id
          where so.id = ${orderId}`);
        if (!so) throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
        so.lines = asRows(await tx`
          select l.id, l.line_no, l.item_id, i.sku, l.description, l.quantity::text, l.unit_price::text, l.discount_pct::text, l.tax_rate::text,
                 coalesce(sl.on_hand, 0)::text as on_hand
          from sales_order_lines l
          join inventory_items i on i.id = l.item_id
          left join stock_levels sl on sl.item_id = l.item_id and sl.warehouse_id = ${so.warehouseId}
          where l.sales_order_id = ${orderId} order by l.line_no`);
        const base = so.lines.reduce((s, l) => s + Math.round(Number(l.quantity) * Number(l.unitPrice) * (1 - Number(l.discountPct) / 100) * 100) / 100, 0);
        const tax = so.lines.reduce(
          (s, l) => s + (Math.round(Number(l.quantity) * Number(l.unitPrice) * (1 - Number(l.discountPct) / 100) * 100) / 100) * (Number(l.taxRate) / 100),
          0,
        );
        so.base = base.toFixed(2);
        so.total = (base + tax).toFixed(2);
        return so;
      });
    },

    async create(ctx: TenantContext, raw: unknown): Promise<string> {
      const input = SalesOrderInput.parse(raw);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [customer] = await tx<{ price_list_id: string | null }[]>`select price_list_id from parties where id = ${input.customerId} and is_customer`;
        if (!customer) throw new DomainError('VALIDATION', 'El tercero no es cliente');
        const [so] = await tx<{ id: string }[]>`
          insert into sales_orders (organization_id, customer_id, warehouse_id, price_list_id, notes)
          values (${orgId}, ${input.customerId}, ${input.warehouseId}, ${customer.price_list_id}, ${input.notes ?? null}) returning id`;
        await tx`
          insert into sales_order_lines ${tx(
            input.lines.map((l, i) => ({
              organization_id: orgId,
              sales_order_id: so!.id,
              line_no: i + 1,
              item_id: l.itemId,
              description: l.description,
              quantity: l.quantity,
              unit_price: l.unitPrice,
              discount_pct: l.discountPct,
              tax_rate: l.taxRate,
            })),
            'organization_id', 'sales_order_id', 'line_no', 'item_id', 'description', 'quantity', 'unit_price', 'discount_pct', 'tax_rate',
          )}`;
        return so!.id;
      });
    },

    async confirm(ctx: TenantContext, id: string) {
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`update sales_orders set status = 'confirmed' where id = ${z.uuid().parse(id)} and status = 'draft' returning id`;
        if (rows.length === 0) throw new DomainError('INVALID_STATE', 'Solo se confirman borradores');
      });
    },

    async cancel(ctx: TenantContext, id: string) {
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`update sales_orders set status = 'cancelled' where id = ${z.uuid().parse(id)} and status in ('draft', 'confirmed') returning id`;
        if (rows.length === 0) throw new DomainError('INVALID_STATE', 'Un pedido servido no se anula: emite un abono');
      });
    },

    /** Servir: salida de stock por línea (artículos inventariables) en una transacción. */
    async deliver(ctx: TenantContext, id: string) {
      const orderId = z.uuid().parse(id);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        const [so] = await tx<{ status: string; warehouse_id: string }[]>`select status, warehouse_id from sales_orders where id = ${orderId} for update`;
        if (!so) throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
        if (so.status !== 'confirmed') throw new DomainError('INVALID_STATE', 'Solo se sirven pedidos confirmados');
        // Orden por artículo: mismo orden de bloqueo que los albaranes.
        await tx`
          insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, source_type, source_id, source_line_id, note)
          select ${orgId}, ${so.warehouse_id}, l.item_id, 'sale', -l.quantity, 'sale', ${orderId}, l.id, 'Pedido de venta'
          from sales_order_lines l join inventory_items i on i.id = l.item_id
          where l.sales_order_id = ${orderId} and i.item_type = 'stockable'
          order by l.item_id`;
        await tx`update sales_orders set status = 'delivered', delivered_at = now() where id = ${orderId}`;
      });
    },

    /** Facturar: crea la factura con las líneas del pedido y la emite en la misma transacción. */
    async invoice(ctx: TenantContext, id: string, seriesId: string): Promise<string> {
      const orderId = z.uuid().parse(id);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [so] = await tx<{ status: string; customer_id: string; payment_terms_days: number }[]>`
          select so.status, so.customer_id, p.payment_terms_days
          from sales_orders so join parties p on p.id = so.customer_id where so.id = ${orderId} for update of so`;
        if (!so) throw new DomainError('NOT_FOUND', 'Pedido no encontrado');
        if (so.status !== 'delivered') throw new DomainError('INVALID_STATE', 'Se factura un pedido ya servido');
        const lines = await tx<{ item_id: string; description: string; quantity: string; unit_price: string; discount_pct: string; tax_rate: string }[]>`
          select item_id, description, quantity::text, unit_price::text, discount_pct::text, tax_rate::text
          from sales_order_lines where sales_order_id = ${orderId} order by line_no`;
        const [inv] = await tx<{ id: string }[]>`
          insert into invoices (organization_id, direction, party_id, due_date)
          values (${orgId}, 'issued', ${so.customer_id}, current_date + ${so.payment_terms_days}::int) returning id`;
        await insertLines(
          tx,
          orgId,
          inv!.id,
          lines.map((l) => ({ itemId: l.item_id, description: l.description, quantity: l.quantity, unitPrice: l.unit_price, discountPct: l.discount_pct, taxRate: l.tax_rate })),
        );
        await tx`select id from app.issue_invoice(${inv!.id}, ${z.uuid('Elige una serie').parse(seriesId)}, current_date)`;
        await tx`update sales_orders set status = 'invoiced', invoice_id = ${inv!.id} where id = ${orderId}`;
        return inv!.id;
      });
    },

    async posCatalog(ctx: TenantContext, warehouseId: string): Promise<PosProduct[]> {
      const wh = z.uuid().parse(warehouseId);
      return withTenant(sql, ctx, async (tx) =>
        asRows<PosProduct>(await tx`
          select i.id, i.sku, i.barcode, i.name, i.item_type, i.default_tax_rate::text as tax_rate,
                 coalesce((select pli.unit_price from price_list_items pli join price_lists pl on pl.id = pli.price_list_id
                           where pl.is_default and pli.item_id = i.id order by pli.min_quantity limit 1), 0)::text as unit_price,
                 coalesce(sl.on_hand, 0)::text as on_hand
          from inventory_items i
          left join stock_levels sl on sl.item_id = i.id and sl.warehouse_id = ${wh}
          where i.is_active
          order by i.name`),
      );
    },

    /**
     * Cobro de TPV, todo o nada: ticket F2 (serie simplificada del año) con su
     * huella, salida de stock y cobro. Los precios se leen de la tarifa por
     * defecto en el servidor: el cliente solo envía artículos y cantidades.
     */
    async posCheckout(ctx: TenantContext, raw: unknown): Promise<{ invoiceId: string; fullNumber: string; total: string; change: string | null }> {
      const input = PosCheckoutInput.parse(raw);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [series] = await tx<{ id: string }[]>`
          select id from invoice_series
          where invoice_kind = 'simplified' and is_active and fiscal_year = extract(year from current_date)::int
          order by code limit 1`;
        if (!series) throw new DomainError('VALIDATION', 'Crea una serie de tickets (simplificadas) para este año en Facturación › Series');

        const ids = input.lines.map((l) => l.itemId);
        const products = await tx<{ id: string; name: string; item_type: string; tax_rate: string; unit_price: string | null }[]>`
          select i.id, i.name, i.item_type, i.default_tax_rate::text as tax_rate,
                 (select pli.unit_price::text from price_list_items pli join price_lists pl on pl.id = pli.price_list_id
                  where pl.is_default and pli.item_id = i.id order by pli.min_quantity limit 1) as unit_price
          from inventory_items i where i.id in ${tx(ids)}`;
        const byId = new Map(products.map((p) => [p.id, p]));
        const missing = input.lines.find((l) => !byId.get(l.itemId)?.unit_price);
        if (missing) throw new DomainError('VALIDATION', `«${byId.get(missing.itemId)?.name ?? 'Artículo'}» no tiene precio en la tarifa general`);

        const [inv] = await tx<{ id: string }[]>`
          insert into invoices (organization_id, direction, party_id, invoice_type, due_date)
          values (${orgId}, 'issued', null, 'F2', current_date) returning id`;
        await insertLines(
          tx,
          orgId,
          inv!.id,
          input.lines.map((l) => {
            const p = byId.get(l.itemId)!;
            return { itemId: p.id, description: p.name, quantity: l.quantity, unitPrice: p.unit_price!, discountPct: '0', taxRate: p.tax_rate };
          }),
        );
        const [issued] = await tx<{ full_number: string; total: string }[]>`
          select full_number, total::text from app.issue_invoice(${inv!.id}, ${series.id}, current_date)`;

        await tx`
          insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, source_type, source_id, source_line_id, note)
          select ${orgId}, ${input.warehouseId}, l.item_id, 'sale', -l.quantity, 'invoice', ${inv!.id}, l.id, 'Venta TPV'
          from invoice_lines l join inventory_items i on i.id = l.item_id
          where l.invoice_id = ${inv!.id} and i.item_type = 'stockable'
          order by l.item_id`;

        await tx`
          insert into invoice_payments (organization_id, invoice_id, amount, method)
          values (${orgId}, ${inv!.id}, ${issued!.total}, ${input.method})`;

        const change =
          input.method === 'cash' && input.tendered !== undefined ? (Number(input.tendered) - Number(issued!.total)).toFixed(2) : null;
        if (change !== null && Number(change) < 0) throw new DomainError('VALIDATION', 'El efectivo entregado no cubre el total');
        return { invoiceId: inv!.id, fullNumber: issued!.full_number, total: issued!.total, change };
      });
    },

    async recentTickets(ctx: TenantContext) {
      return withTenant(sql, ctx, async (tx) =>
        asRows<{ id: string; fullNumber: string; total: string; issueDate: string; fiscalRecordAt: Date; method: string }>(await tx`
          select i.id, i.full_number, i.total::text, i.issue_date::text, i.fiscal_record_at,
                 (select method from invoice_payments where invoice_id = i.id limit 1) as method
          from invoices i where i.invoice_type = 'F2' and i.direction = 'issued' and i.status <> 'draft'
          order by i.fiscal_record_at desc limit 10`),
      );
    },
  };
}

export type SalesService = ReturnType<typeof createSalesService>;
