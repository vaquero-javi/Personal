import { z } from 'zod';
import { DomainError, decimalString, singleOrganization, type TenantContext } from '@omnia/core';
import { asRow, asRows, withTenant, type Sql, type Tx } from '@omnia/db';

export { foodCostPct, grossMargin } from './costing';

/**
 * Escandallos y materia prima. Lo usan el TPV (descuento al cobrar, fichas y
 * costes para el encargado) y el backoffice: los costes salen del coste medio
 * ponderado que mantiene el libro de stock con cada albarán.
 */

export interface Ingredient {
  id: string;
  sku: string;
  name: string;
  unit: string;
  /** Formato de compra («pack» de 24 ud), si se compra distinto de como se gasta. */
  purchaseUnit: string | null;
  purchasePackSize: string;
  onHand: string;
  minQuantity: string;
  avgUnitCost: string;
  hasStockRow: boolean;
  usedIn: number;
}

export interface CostedProduct {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  pvp: string | null;
  taxRate: string;
  netPrice: string | null;
  unitCost: string | null;
  hasRecipe: boolean;
  trackStock: boolean;
  soldLast30: string;
}

export interface RecipeLine {
  ingredientId: string;
  name: string;
  unit: string;
  quantity: string;
  unitCost: string;
  cost: string;
}

export interface RecipeDetail extends CostedProduct {
  lines: RecipeLine[];
}

export const RecipeInput = z.object({
  productId: z.uuid(),
  lines: z
    .array(z.object({ ingredientId: z.uuid('Elige un ingrediente'), quantity: decimalString({ scale: 4, sign: 'positive' }) }))
    .max(40)
    .refine((lines) => new Set(lines.map((l) => l.ingredientId)).size === lines.length, 'Un ingrediente aparece dos veces'),
});

const RecountInput = z.object({
  warehouseId: z.uuid(),
  itemId: z.uuid(),
  counted: decimalString({ scale: 4, sign: 'any' }),
});

const MinimumInput = z.object({
  warehouseId: z.uuid(),
  itemId: z.uuid(),
  minQuantity: decimalString({ scale: 4, sign: 'non-negative' }),
});

/**
 * Columnas de coste comunes. `unit_cost`: con escandallo, la suma de sus
 * ingredientes al coste medio del almacén; sin él, el coste medio del propio
 * artículo si es inventariable.
 */
const productSelect = (tx: Tx, warehouseId: string) => tx`
  select i.id, i.name, i.pos_category_id as category_id, c.name as category_name,
         i.default_tax_rate::text as tax_rate,
         i.item_type = 'stockable' as track_stock,
         exists (select 1 from recipe_lines r where r.product_id = i.id) as has_recipe,
         pr.pvp::text as pvp,
         round(pr.pvp / (1 + i.default_tax_rate / 100), 4)::text as net_price,
         case
           when exists (select 1 from recipe_lines r where r.product_id = i.id) then (
             select round(sum(r.quantity * coalesce(sl.avg_unit_cost, 0)), 4)
             from recipe_lines r
             left join stock_levels sl on sl.item_id = r.ingredient_id and sl.warehouse_id = ${warehouseId}
             where r.product_id = i.id)
           when i.item_type = 'stockable' then (
             select round(sl.avg_unit_cost, 4) from stock_levels sl where sl.item_id = i.id and sl.warehouse_id = ${warehouseId})
         end::text as unit_cost,
         coalesce((
           select sum(l.quantity) from invoice_lines l join invoices v on v.id = l.invoice_id
           where l.item_id = i.id and v.invoice_type = 'F2' and v.status <> 'draft' and v.issue_date > current_date - 30
         ), 0)::text as sold_last30
  from inventory_items i
  left join pos_categories c on c.id = i.pos_category_id
  left join lateral (
    select case when pl.prices_include_tax then x.unit_price else x.unit_price * (1 + i.default_tax_rate / 100) end as pvp
    from price_lists pl join price_list_items x on x.price_list_id = pl.id
    where pl.is_default and x.item_id = i.id
    order by x.min_quantity limit 1
  ) pr on true`;

export function createRecipeService(sql: Sql) {
  return {
    /** Materia prima: artículos inventariables con su stock y coste en el almacén. */
    async ingredients(ctx: TenantContext, warehouseId: string): Promise<Ingredient[]> {
      const wh = z.uuid().parse(warehouseId);
      return withTenant(sql, ctx, async (tx) =>
        asRows<Ingredient>(await tx`
          select i.id, i.sku, i.name, i.unit_of_measure as unit, i.purchase_unit, i.purchase_pack_size::text,
                 coalesce(sl.on_hand, 0)::text as on_hand,
                 coalesce(sl.min_quantity, 0)::text as min_quantity,
                 coalesce(sl.avg_unit_cost, 0)::text as avg_unit_cost,
                 sl.item_id is not null as has_stock_row,
                 (select count(*)::int from recipe_lines r where r.ingredient_id = i.id) as used_in
          from inventory_items i
          left join stock_levels sl on sl.item_id = i.id and sl.warehouse_id = ${wh}
          where i.is_active and i.item_type = 'stockable'
          order by (coalesce(sl.on_hand, 0) <= coalesce(sl.min_quantity, 0) and sl.min_quantity > 0) desc, i.name`),
      );
    },

    /** Productos de la carta (con categoría o con escandallo) y su coste. */
    async products(ctx: TenantContext, warehouseId: string): Promise<CostedProduct[]> {
      const wh = z.uuid().parse(warehouseId);
      return withTenant(sql, ctx, async (tx) =>
        asRows<CostedProduct>(await tx`
          ${productSelect(tx, wh)}
          where i.is_active and (i.pos_category_id is not null or exists (select 1 from recipe_lines r where r.product_id = i.id))
          order by c.sort_order nulls last, c.name, i.name`),
      );
    },

    async get(ctx: TenantContext, productId: string, warehouseId: string): Promise<RecipeDetail> {
      const id = z.uuid().parse(productId);
      const wh = z.uuid().parse(warehouseId);
      return withTenant(sql, ctx, async (tx) => {
        const product = asRow<RecipeDetail>(await tx`${productSelect(tx, wh)} where i.id = ${id}`);
        if (!product) throw new DomainError('NOT_FOUND', 'Producto no encontrado');
        product.lines = asRows<RecipeLine>(await tx`
          select r.ingredient_id, i.name, i.unit_of_measure as unit, r.quantity::text,
                 coalesce(sl.avg_unit_cost, 0)::text as unit_cost,
                 round(r.quantity * coalesce(sl.avg_unit_cost, 0), 4)::text as cost
          from recipe_lines r
          join inventory_items i on i.id = r.ingredient_id
          left join stock_levels sl on sl.item_id = r.ingredient_id and sl.warehouse_id = ${wh}
          where r.product_id = ${id}
          order by i.name`);
        return product;
      });
    },

    /** Sustituye la ficha técnica entera (lista vacía = sin escandallo). */
    async save(ctx: TenantContext, raw: unknown) {
      const input = RecipeInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        const [product] = await tx`select id from inventory_items where id = ${input.productId} for update`;
        if (!product) throw new DomainError('NOT_FOUND', 'Producto no encontrado');
        await tx`delete from recipe_lines where product_id = ${input.productId}`;
        if (input.lines.length > 0) {
          await tx`
            insert into recipe_lines ${tx(
              input.lines.map((l) => ({ organization_id: orgId, product_id: input.productId, ingredient_id: l.ingredientId, quantity: l.quantity })),
              'organization_id', 'product_id', 'ingredient_id', 'quantity',
            )}`;
        }
      });
    },

    async setMinimum(ctx: TenantContext, raw: unknown) {
      const input = MinimumInput.parse(raw);
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`
          update stock_levels set min_quantity = ${input.minQuantity}
          where warehouse_id = ${input.warehouseId} and item_id = ${input.itemId} returning item_id`;
        if (rows.length === 0) throw new DomainError('VALIDATION', 'Este ingrediente aún no ha tenido entradas en el almacén');
      });
    },

    /** Recuento físico: registra un ajuste por la diferencia con el stock teórico. */
    async recount(ctx: TenantContext, raw: unknown): Promise<string> {
      const input = RecountInput.parse(raw);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [level] = await tx<{ delta: string }[]>`
          select (${input.counted}::numeric - coalesce((
            select on_hand from stock_levels where warehouse_id = ${input.warehouseId} and item_id = ${input.itemId} for update
          ), 0))::text as delta`;
        const delta = level!.delta;
        if (Number(delta) === 0) return '0';
        await tx`
          insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, note)
          values (${orgId}, ${input.warehouseId}, ${input.itemId}, 'adjustment', ${delta}, 'Recuento en TPV')`;
        return delta;
      });
    },
  };
}

export type RecipeService = ReturnType<typeof createRecipeService>;

/**
 * Salida de stock de un ticket ya emitido, en la transacción del cobro:
 *  - artículo inventariable sin escandallo → sale el propio artículo (por línea);
 *  - artículo con escandallo → salen sus ingredientes, sumados por ticket.
 * Un solo INSERT ordenado por artículo: mismo orden de bloqueo que los albaranes.
 */
export async function postSaleConsumption(tx: Tx, { organizationId, warehouseId, invoiceId, note = 'Venta TPV' }: { organizationId: string; warehouseId: string; invoiceId: string; note?: string }) {
  await tx`
    insert into stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, source_type, source_id, source_line_id, note)
    select ${organizationId}, ${warehouseId}, m.item_id, 'sale', -m.quantity, 'invoice', ${invoiceId}, m.line_id, m.note
    from (
      select l.item_id, l.quantity, l.id as line_id, ${note}::text as note
      from invoice_lines l join inventory_items i on i.id = l.item_id
      where l.invoice_id = ${invoiceId} and i.item_type = 'stockable'
        and not exists (select 1 from recipe_lines r where r.product_id = l.item_id)
      union all
      select r.ingredient_id, sum(l.quantity * r.quantity), null::uuid, ${`${note} · escandallo`}::text
      from invoice_lines l join recipe_lines r on r.product_id = l.item_id
      where l.invoice_id = ${invoiceId}
      group by r.ingredient_id
    ) m
    order by m.item_id`;
}
