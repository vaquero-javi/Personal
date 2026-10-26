import { z } from 'zod';
import {
  DomainError,
  decimalString,
  isoDate,
  optionalIsoDate,
  optionalText,
  optionalUuid,
  requiredText,
  singleOrganization,
  type TenantContext,
} from '@omnia/core';
import { asRow, asRows, withTenant, type Sql, type Tx } from '@omnia/db';

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled';
export type FiscalStatus = 'not_applicable' | 'pending' | 'sent' | 'accepted' | 'accepted_with_errors' | 'rejected';

export interface InvoiceSummary {
  id: string;
  direction: 'issued' | 'received';
  status: InvoiceStatus;
  invoiceType: string;
  fullNumber: string | null;
  partyName: string | null;
  issueDate: string | null;
  dueDate: string | null;
  total: string;
  paidTotal: string;
  overdueDays: number | null;
  fiscalStatus: FiscalStatus;
}

export interface InvoiceLine {
  id: string;
  lineNo: number;
  itemId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  taxRate: string;
  lineBase: string;
  lineTax: string;
}

export interface PartySnapshot {
  legalName: string;
  taxId?: string;
  address?: { line?: string; postalCode?: string; city?: string; province?: string };
}

export interface InvoiceDetail extends InvoiceSummary {
  partyId: string | null;
  partyTaxId: string | null;
  seriesCode: string | null;
  subtotal: string;
  taxTotal: string;
  operationDate: string | null;
  rectifiesInvoiceId: string | null;
  rectifiesNumber: string | null;
  fiscalRecordHash: string | null;
  fiscalPreviousHash: string | null;
  fiscalRecordAt: Date | null;
  fiscalResponse: { code?: string; message?: string } | null;
  notes: string | null;
  paymentMethod: string | null;
  withholdingRate: string;
  withholdingTotal: string;
  /** Emisor y destinatario tal como eran al emitir (null en borradores). */
  issuerSnapshot: PartySnapshot & { tradeName?: string; iban?: string } | null;
  partySnapshot: PartySnapshot | null;
  lines: InvoiceLine[];
  payments: { id: string; amount: string; paidAt: string; method: string; reference: string | null }[];
  taxBreakdown: { taxRate: string; base: string; tax: string }[];
}

export interface Series {
  id: string;
  code: string;
  description: string | null;
  invoiceKind: 'standard' | 'simplified' | 'rectifying';
  fiscalYear: number;
  nextNumber: number;
  isActive: boolean;
}

const LineInput = z.object({
  itemId: optionalUuid(),
  description: requiredText(300, 'Describe la línea'),
  quantity: decimalString({ scale: 4 }),
  unitPrice: decimalString({ scale: 4 }),
  discountPct: z.preprocess((v) => (v === '' || v === undefined ? '0' : v), decimalString({ scale: 2, sign: 'non-negative' })),
  taxRate: decimalString({ scale: 2, sign: 'non-negative' }),
});

export const InvoiceDraftInput = z
  .object({
    direction: z.enum(['issued', 'received']),
    // Vacío solo en simplificadas (F2): cliente de mostrador.
    partyId: optionalUuid(),
    invoiceType: z.enum(['F1', 'F2', 'F3', 'R1', 'R2', 'R3', 'R4', 'R5']).default('F1'),
    supplierNumber: optionalText(60),
    issueDate: optionalIsoDate(),
    operationDate: optionalIsoDate(),
    dueDate: optionalIsoDate(),
    paymentMethod: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['transfer', 'card', 'cash', 'direct_debit', 'other']).optional()),
    withholdingRate: z.preprocess(
      (v) => (v === '' || v === undefined ? '0' : v),
      decimalString({ scale: 2, sign: 'non-negative' }).refine((v) => Number(v) <= 50, 'La retención no supera el 50 %'),
    ),
    notes: optionalText(2000),
    lines: z.array(LineInput).min(1, 'Añade al menos una línea'),
  })
  .refine((v) => v.partyId || v.invoiceType === 'F2', { path: ['partyId'], message: 'Elige el cliente o proveedor' });

/** «Emitir ya» desde el editor: serie y fecha de expedición. */
export const IssueNowInput = z.object({
  seriesId: z.uuid('Elige una serie'),
  issueDate: isoDate(),
});

export const PaymentInput = z.object({
  invoiceId: z.uuid(),
  amount: decimalString({ scale: 2, sign: 'positive' }),
  paidAt: isoDate(),
  method: z.enum(['transfer', 'card', 'cash', 'direct_debit', 'other']),
  reference: optionalText(100),
});

export const SeriesInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,10}$/, 'Letras y números, sin espacios'),
  description: optionalText(100),
  invoiceKind: z.enum(['standard', 'simplified', 'rectifying']),
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
});

const SUMMARY_COLUMNS = (tx: Tx) => tx`
  i.id, i.direction, i.status, i.invoice_type, i.full_number, p.legal_name as party_name,
  i.issue_date::text, i.due_date::text, i.total::text, i.paid_total::text, i.fiscal_status,
  case when i.status in ('issued', 'partially_paid') and i.due_date < current_date
       then (current_date - i.due_date) end as overdue_days`;

export function createInvoicingService(sql: Sql) {
  return {
    async list(
      ctx: TenantContext,
      { direction = 'issued', status, search, partyId }: { direction?: 'issued' | 'received'; status?: string; search?: string; partyId?: string } = {},
    ): Promise<InvoiceSummary[]> {
      const term = search?.trim() ? `%${search.trim()}%` : null;
      return withTenant(sql, ctx, async (tx) =>
        asRows<InvoiceSummary>(await tx`
          select ${SUMMARY_COLUMNS(tx)}
          from invoices i left join parties p on p.id = i.party_id
          where i.direction = ${direction}
            and (${status ?? null}::text is null
                 or (${status ?? null} = 'overdue' and i.status in ('issued', 'partially_paid') and i.due_date < current_date)
                 or (${status ?? null} = 'unpaid' and i.status in ('issued', 'partially_paid'))
                 or i.status = ${status ?? null})
            and (${term}::text is null or i.full_number ilike ${term} or p.legal_name ilike ${term})
            and (${partyId ?? null}::uuid is null or i.party_id = ${partyId ?? null})
          order by (i.status = 'draft') desc, i.issue_date desc nulls first, i.full_number desc
          limit 300`),
      );
    },

    async get(ctx: TenantContext, id: string): Promise<InvoiceDetail> {
      const invoiceId = z.uuid().parse(id);
      return withTenant(sql, ctx, async (tx) => {
        const inv = asRow<InvoiceDetail>(await tx`
          select ${SUMMARY_COLUMNS(tx)}, i.party_id, p.tax_id as party_tax_id, s.code as series_code,
                 i.subtotal::text, i.tax_total::text, i.operation_date::text, i.rectifies_invoice_id, r.full_number as rectifies_number,
                 i.fiscal_record_hash, i.fiscal_previous_hash, i.fiscal_record_at, i.fiscal_response,
                 i.notes, i.payment_method, i.withholding_rate::text, i.withholding_total::text,
                 i.issuer_snapshot, i.party_snapshot
          from invoices i
          left join parties p on p.id = i.party_id
          left join invoice_series s on s.id = i.series_id
          left join invoices r on r.id = i.rectifies_invoice_id
          where i.id = ${invoiceId}`);
        if (!inv) throw new DomainError('NOT_FOUND', 'Factura no encontrada');
        inv.lines = asRows<InvoiceLine>(await tx`
          select id, line_no, item_id, description, quantity::text, unit_price::text, discount_pct::text, tax_rate::text,
                 line_base::text, line_tax::text
          from invoice_lines where invoice_id = ${invoiceId} order by line_no`);
        inv.payments = asRows(await tx`
          select id, amount::text, paid_at::text, method, reference from invoice_payments where invoice_id = ${invoiceId} order by paid_at`);
        inv.taxBreakdown = asRows(await tx`
          select tax_rate::text, sum(line_base)::text as base, sum(line_tax)::text as tax
          from invoice_lines where invoice_id = ${invoiceId} group by tax_rate order by tax_rate desc`);
        return inv;
      });
    },

    /**
     * Crea un borrador (o reescribe uno existente con `id`) y, si llega
     * `issueNow`, lo emite en la misma transacción: si la emisión falla no
     * queda nada a medias.
     */
    async saveDraft(ctx: TenantContext, raw: unknown, { id, issueNow }: { id?: string; issueNow?: unknown } = {}): Promise<string> {
      const input = InvoiceDraftInput.parse(raw);
      const issue = issueNow === undefined ? null : IssueNowInput.parse(issueNow);
      const draftId = id === undefined ? null : z.uuid().parse(id);
      const orgId = singleOrganization(ctx);
      if (input.direction === 'received' && (!input.supplierNumber || !input.issueDate || !input.partyId)) {
        throw new DomainError('VALIDATION', 'Indica el proveedor, y el número y la fecha de su factura');
      }
      if (issue && input.direction !== 'issued') throw new DomainError('VALIDATION', 'Solo se emiten facturas emitidas');
      // La retención solo se aplica a las emitidas (las recibidas se registran tal cual).
      const withholding = input.direction === 'issued' ? input.withholdingRate : '0';
      return withTenant(sql, ctx, async (tx) => {
        let termsDays = 0;
        if (input.partyId) {
          const [party] = await tx<{ payment_terms_days: number }[]>`
            select payment_terms_days from parties where id = ${input.partyId}
              and (${input.direction} = 'issued' and is_customer or ${input.direction} = 'received' and is_supplier)`;
          if (!party) throw new DomainError('VALIDATION', input.direction === 'issued' ? 'El tercero no es cliente' : 'El tercero no es proveedor');
          termsDays = party.payment_terms_days;
        }
        const baseDate = input.issueDate ?? issue?.issueDate ?? null;
        const values = {
          party_id: input.partyId ?? null,
          invoice_type: input.invoiceType,
          full_number: input.direction === 'received' ? input.supplierNumber! : null,
          issue_date: input.direction === 'received' ? input.issueDate! : null,
          operation_date: input.operationDate ?? null,
          payment_method: input.paymentMethod ?? null,
          withholding_rate: withholding,
          notes: input.notes ?? null,
        };
        let invoiceId: string;
        if (draftId) {
          const [row] = await tx<{ id: string }[]>`
            update invoices set ${tx(values)}, updated_at = now(),
              due_date = coalesce(${input.dueDate ?? null}::date, coalesce(${baseDate}::date, current_date) + ${termsDays}::int)
            where id = ${draftId} and direction = ${input.direction} and status = 'draft' returning id`;
          if (!row) throw new DomainError('INVALID_STATE', 'Solo se editan borradores');
          invoiceId = row.id;
          await tx`delete from invoice_lines where invoice_id = ${invoiceId}`;
        } else {
          const [row] = await tx<{ id: string }[]>`
            insert into invoices ${tx({ ...values, organization_id: orgId, direction: input.direction })}
            returning id`;
          invoiceId = row!.id;
          await tx`
            update invoices set due_date = coalesce(${input.dueDate ?? null}::date, coalesce(${baseDate}::date, current_date) + ${termsDays}::int)
            where id = ${invoiceId}`;
        }
        await insertLines(tx, orgId, invoiceId, input.lines);
        if (input.direction === 'received') await tx`select app.register_received_invoice(${invoiceId})`;
        if (issue) await tx`select id from app.issue_invoice(${invoiceId}, ${issue.seriesId}, ${issue.issueDate})`;
        return invoiceId;
      });
    },

    async createDraft(ctx: TenantContext, raw: unknown): Promise<string> {
      return this.saveDraft(ctx, raw);
    },

    async deleteDraft(ctx: TenantContext, id: string) {
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`delete from invoices where id = ${z.uuid().parse(id)} and status = 'draft' returning id`;
        if (rows.length === 0) throw new DomainError('INVALID_STATE', 'Solo se borran borradores');
      });
    },

    /** Numera, totaliza y encadena la huella (app.issue_invoice, una transacción). */
    async issue(ctx: TenantContext, id: string, seriesId: string, issueDate: string) {
      await withTenant(sql, ctx, (tx) =>
        tx`select id from app.issue_invoice(${z.uuid().parse(id)}, ${z.uuid('Elige una serie').parse(seriesId)}, ${isoDate().parse(issueDate)})`,
      );
    },

    async registerPayment(ctx: TenantContext, raw: unknown) {
      const input = PaymentInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, (tx) => tx`
        insert into invoice_payments (organization_id, invoice_id, amount, paid_at, method, reference)
        values (${orgId}, ${input.invoiceId}, ${input.amount}, ${input.paidAt}, ${input.method}, ${input.reference ?? null})`);
    },

    /** Rectificativa por diferencias: borrador R1 con las líneas del original en negativo. */
    async createRectifying(ctx: TenantContext, id: string): Promise<string> {
      const originalId = z.uuid().parse(id);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [orig] = await tx<{ party_id: string | null; status: string; direction: string }[]>`
          select party_id, status, direction from invoices where id = ${originalId}`;
        if (!orig || orig.direction !== 'issued' || orig.status === 'draft' || orig.status === 'cancelled') {
          throw new DomainError('INVALID_STATE', 'Solo se rectifican facturas emitidas');
        }
        const [inv] = await tx<{ id: string }[]>`
          insert into invoices (organization_id, direction, party_id, invoice_type, rectifies_invoice_id, due_date)
          values (${orgId}, 'issued', ${orig.party_id}, 'R1', ${originalId}, current_date) returning id`;
        await tx`
          insert into invoice_lines (organization_id, invoice_id, line_no, item_id, description, quantity, unit_price, discount_pct, tax_rate)
          select organization_id, ${inv!.id}, line_no, item_id, description, -quantity, unit_price, discount_pct, tax_rate
          from invoice_lines where invoice_id = ${originalId}`;
        return inv!.id;
      });
    },

    async series(ctx: TenantContext): Promise<Series[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<Series>(await tx`
          select id, code, description, invoice_kind, fiscal_year, next_number, is_active
          from invoice_series order by fiscal_year desc, invoice_kind, code`),
      );
    },

    async createSeries(ctx: TenantContext, raw: unknown) {
      const input = SeriesInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, (tx) => tx`
        insert into invoice_series (organization_id, code, description, invoice_kind, fiscal_year)
        values (${orgId}, ${input.code}, ${input.description ?? null}, ${input.invoiceKind}, ${input.fiscalYear})`);
    },

    async fiscalRecords(ctx: TenantContext): Promise<(InvoiceSummary & { fiscalRecordHash: string; fiscalRecordAt: Date; fiscalResponse: { message?: string } | null })[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows(await tx`
          select ${SUMMARY_COLUMNS(tx)}, i.fiscal_record_hash, i.fiscal_record_at, i.fiscal_response
          from invoices i left join parties p on p.id = i.party_id
          where i.direction = 'issued' and i.fiscal_record_hash is not null
          order by i.fiscal_record_at desc limit 200`),
      );
    },

    /** Reenvío tras corregir: vuelve a la cola del worker de la AEAT. */
    async requeueFiscal(ctx: TenantContext, id: string) {
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`
          update invoices set fiscal_status = 'pending', fiscal_response = null
          where id = ${z.uuid().parse(id)} and fiscal_status = 'rejected' returning id`;
        if (rows.length === 0) throw new DomainError('INVALID_STATE', 'Solo se reenvían registros rechazados');
      });
    },
  };
}

export async function insertLines(tx: Tx, orgId: string, invoiceId: string, lines: z.infer<typeof LineInput>[]) {
  await tx`
    insert into invoice_lines ${tx(
      lines.map((l, i) => ({
        organization_id: orgId,
        invoice_id: invoiceId,
        line_no: i + 1,
        item_id: l.itemId ?? null,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        discount_pct: l.discountPct,
        tax_rate: l.taxRate,
      })),
      'organization_id', 'invoice_id', 'line_no', 'item_id', 'description', 'quantity', 'unit_price', 'discount_pct', 'tax_rate',
    )}`;
}

export type InvoicingService = ReturnType<typeof createInvoicingService>;
