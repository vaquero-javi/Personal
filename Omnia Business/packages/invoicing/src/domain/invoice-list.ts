import { z } from 'zod';
import { DomainError } from '@omnia/core';

/**
 * Contrato del listado paginado de facturas. Dominio puro: Zod y reglas, sin SQL.
 * Lo comparten el servicio, la API (`GET /api/v1/invoices`) y las páginas.
 */

export const INVOICE_LIST_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'cancelled', 'unpaid', 'overdue'] as const;
export const INVOICE_LIST_KINDS = ['invoice', 'corrective', 'ticket'] as const;
export const INVOICE_PAGE_SIZE = { default: 50, max: 100 } as const;

/** Entrada validada en la frontera: lo que no cumple no llega a la base de datos. */
export const InvoiceListQuery = z.object({
  direction: z.enum(['issued', 'received']).default('issued'),
  status: z.enum(INVOICE_LIST_STATUSES).optional(),
  kind: z.enum(INVOICE_LIST_KINDS).optional(),
  search: z
    .string()
    .trim()
    .max(100)
    .transform((s) => s || undefined)
    .optional(),
  partyId: z.uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(INVOICE_PAGE_SIZE.max).default(INVOICE_PAGE_SIZE.default),
});
export type InvoiceListQuery = z.output<typeof InvoiceListQuery>;
export type InvoiceListQueryInput = z.input<typeof InvoiceListQuery>;

/**
 * Posición en el orden del listado: (borrador, fecha, alta, id), todo descendente.
 * Coincide columna a columna con `invoices_keyset_idx`. El `id` desempata, así que
 * dos facturas nunca comparten posición y ninguna se repite ni se salta entre páginas.
 */
export const InvoiceCursor = z.object({
  draft: z.boolean(),
  sortDate: z.union([z.iso.date(), z.literal('infinity')]),
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});
export type InvoiceCursor = z.output<typeof InvoiceCursor>;

/**
 * El cursor viaja al cliente como texto opaco (base64url). No es un secreto: si
 * alguien lo manipula solo puede saltar a otra posición de SUS facturas, porque
 * la RLS sigue aplicándose. Lo que sí se impide es que llegue basura a la consulta.
 */
export function encodeCursor(cursor: InvoiceCursor): string {
  return Buffer.from(JSON.stringify([cursor.draft, cursor.sortDate, cursor.createdAt, cursor.id])).toString('base64url');
}

export function decodeCursor(raw: string): InvoiceCursor {
  try {
    const [draft, sortDate, createdAt, id] = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown[];
    return InvoiceCursor.parse({ draft, sortDate, createdAt, id });
  } catch {
    throw new DomainError('VALIDATION', 'El enlace de paginación no es válido. Vuelve a la primera página.');
  }
}

export interface InvoicePage<T> {
  items: T[];
  /** null en la última página. */
  nextCursor: string | null;
  /** Pendiente de cobro (emitidas) o de pago (recibidas) de TODO el filtro, no solo de esta página. */
  outstandingTotal: string;
}
