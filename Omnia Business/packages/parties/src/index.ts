import { z } from 'zod';
import { DomainError, decimalString, intField, optionalText, optionalUuid, requiredText, singleOrganization, type TenantContext } from '@omnia/core';
import { asRow, asRows, withTenant, type Sql } from '@omnia/db';

export interface Party {
  id: string;
  isCustomer: boolean;
  isSupplier: boolean;
  legalName: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  paymentTermsDays: number;
  priceListId: string | null;
  priceListName: string | null;
  billingAddress: { line?: string; city?: string; postalCode?: string; province?: string };
}

export interface PartySummary extends Party {
  /** Clientes: pendiente de cobro. Proveedores: pendiente de pago. */
  outstanding: string;
  lastActivity: string | null;
}

export interface PriceList {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  itemCount: number;
}

export interface PriceListItem {
  itemId: string;
  sku: string;
  name: string;
  unitPrice: string | null;
}

export const PartyInput = z
  .object({
    legalName: requiredText(200),
    taxId: optionalText(20),
    email: z.preprocess((v) => (v === '' ? undefined : v), z.email('Email no válido').optional()),
    phone: optionalText(30),
    paymentTermsDays: intField(0, 365).default(30),
    priceListId: optionalUuid(),
    isCustomer: z.boolean(),
    isSupplier: z.boolean(),
    address: optionalText(200),
    postalCode: optionalText(10),
    city: optionalText(80),
    province: optionalText(80),
  })
  .refine((p) => p.isCustomer || p.isSupplier, { message: 'Marca cliente, proveedor o ambos', path: ['isCustomer'] });

export const PriceListInput = z.object({ code: requiredText(20), name: requiredText(80), isDefault: z.boolean().default(false) });

export const SetPriceInput = z.object({
  priceListId: z.uuid(),
  itemId: z.uuid(),
  unitPrice: z.preprocess((v) => (v === '' ? undefined : v), decimalString({ scale: 4, sign: 'non-negative' }).optional()),
});

export function createPartiesService(sql: Sql) {
  return {
    async list(ctx: TenantContext, { role, search }: { role?: 'customer' | 'supplier'; search?: string } = {}): Promise<PartySummary[]> {
      const term = search?.trim() ? `%${search.trim()}%` : null;
      return withTenant(sql, ctx, async (tx) =>
        asRows<PartySummary>(await tx`
          select p.id, p.is_customer, p.is_supplier, p.legal_name, p.tax_id, p.email, p.phone, p.payment_terms_days,
                 p.price_list_id, pl.name as price_list_name, p.billing_address,
                 coalesce((
                   select sum(i.total - i.paid_total) from invoices i
                   where i.party_id = p.id and i.status in ('issued', 'partially_paid')
                     and i.direction = ${role === 'supplier' ? 'received' : 'issued'}
                 ), 0)::text as outstanding,
                 (select max(i.issue_date)::text from invoices i where i.party_id = p.id) as last_activity
          from parties p
          left join price_lists pl on pl.id = p.price_list_id
          where (${role ?? null}::text is null
                 or (${role ?? null} = 'customer' and p.is_customer)
                 or (${role ?? null} = 'supplier' and p.is_supplier))
            and (${term}::text is null or p.legal_name ilike ${term} or p.tax_id ilike ${term})
          order by p.legal_name`),
      );
    },

    async get(ctx: TenantContext, id: string): Promise<Party> {
      return withTenant(sql, ctx, async (tx) => {
        const party = asRow<Party>(await tx`
          select p.id, p.is_customer, p.is_supplier, p.legal_name, p.tax_id, p.email, p.phone, p.payment_terms_days,
                 p.price_list_id, pl.name as price_list_name, p.billing_address
          from parties p left join price_lists pl on pl.id = p.price_list_id
          where p.id = ${z.uuid().parse(id)}`);
        if (!party) throw new DomainError('NOT_FOUND', 'Tercero no encontrado');
        return party;
      });
    },

    async save(ctx: TenantContext, raw: unknown, id?: string): Promise<string> {
      const input = PartyInput.parse(raw);
      const orgId = singleOrganization(ctx);
      const address = { line: input.address, postalCode: input.postalCode, city: input.city, province: input.province };
      return withTenant(sql, ctx, async (tx) => {
        if (id) {
          const rows = await tx`
            update parties set legal_name = ${input.legalName}, tax_id = ${input.taxId ?? null}, email = ${input.email ?? null},
              phone = ${input.phone ?? null}, payment_terms_days = ${input.paymentTermsDays}, price_list_id = ${input.priceListId ?? null},
              is_customer = ${input.isCustomer}, is_supplier = ${input.isSupplier}, billing_address = ${tx.json(address)}
            where id = ${z.uuid().parse(id)} returning id`;
          if (rows.length === 0) throw new DomainError('NOT_FOUND', 'Tercero no encontrado');
          return id;
        }
        const [row] = await tx<{ id: string }[]>`
          insert into parties (organization_id, legal_name, tax_id, email, phone, payment_terms_days, price_list_id, is_customer, is_supplier, billing_address)
          values (${orgId}, ${input.legalName}, ${input.taxId ?? null}, ${input.email ?? null}, ${input.phone ?? null},
                  ${input.paymentTermsDays}, ${input.priceListId ?? null}, ${input.isCustomer}, ${input.isSupplier}, ${tx.json(address)})
          returning id`;
        return row!.id;
      });
    },

    async priceLists(ctx: TenantContext): Promise<PriceList[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<PriceList>(await tx`
          select pl.id, pl.code, pl.name, pl.is_default, count(pli.id)::int as item_count
          from price_lists pl left join price_list_items pli on pli.price_list_id = pl.id
          group by pl.id order by pl.is_default desc, pl.name`),
      );
    },

    async createPriceList(ctx: TenantContext, raw: unknown) {
      const input = PriceListInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        if (input.isDefault) await tx`update price_lists set is_default = false where organization_id = ${orgId}`;
        await tx`insert into price_lists (organization_id, code, name, is_default) values (${orgId}, ${input.code}, ${input.name}, ${input.isDefault})`;
      });
    },

    async priceListItems(ctx: TenantContext, priceListId: string): Promise<PriceListItem[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<PriceListItem>(await tx`
          select i.id as item_id, i.sku, i.name,
                 (select pli.unit_price::text from price_list_items pli
                  where pli.price_list_id = ${z.uuid().parse(priceListId)} and pli.item_id = i.id
                  order by pli.min_quantity limit 1) as unit_price
          from inventory_items i where i.is_active order by i.name`),
      );
    },

    async setPrice(ctx: TenantContext, raw: unknown) {
      const input = SetPriceInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        await tx`delete from price_list_items where price_list_id = ${input.priceListId} and item_id = ${input.itemId} and min_quantity = 1`;
        if (input.unitPrice !== undefined) {
          await tx`
            insert into price_list_items (organization_id, price_list_id, item_id, unit_price)
            values (${orgId}, ${input.priceListId}, ${input.itemId}, ${input.unitPrice})`;
        }
      });
    },

    /** Precio de un artículo para un cliente: su tarifa, si no la tarifa por defecto. */
    async priceFor(ctx: TenantContext, itemIds: readonly string[], priceListId: string | null) {
      if (itemIds.length === 0) return new Map<string, string>();
      return withTenant(sql, ctx, async (tx) => {
        const rows = await tx<{ item_id: string; unit_price: string }[]>`
          select distinct on (pli.item_id) pli.item_id, pli.unit_price::text
          from price_list_items pli join price_lists pl on pl.id = pli.price_list_id
          where pli.item_id in ${tx(itemIds as string[])}
            and (pl.id = ${priceListId} or pl.is_default)
            and pli.valid_from <= current_date and (pli.valid_to is null or pli.valid_to >= current_date)
          order by pli.item_id, (pl.id = ${priceListId}) desc nulls last, pli.min_quantity`;
        return new Map(rows.map((r) => [r.item_id, r.unit_price]));
      });
    },
  };
}

export type PartiesService = ReturnType<typeof createPartiesService>;
