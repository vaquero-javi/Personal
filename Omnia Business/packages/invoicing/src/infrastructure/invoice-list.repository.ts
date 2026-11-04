import type { TenantContext } from '@omnia/core';
import { asRows, orgScope, type Tx } from '@omnia/db';
import type { InvoiceCursor, InvoiceListQuery } from '../domain/invoice-list';

/**
 * Consultas del listado de facturas. Solo SQL: la validación ya está hecha
 * (dominio) y la transacción con identidad la abre el servicio.
 *
 * Plan esperado (comprobado con EXPLAIN y RLS activa, 120.000 facturas en 4 empresas):
 *   Limit → Index Scan using invoices_keyset_idx
 *           Index Cond: organization_id = … AND direction = … AND ROW(…) < ROW(cursor)
 * Sin Sort, sin Seq Scan, y el mismo coste en la página 1 que en la 300.
 */

interface PageRow {
  id: string;
  direction: 'issued' | 'received';
  status: string;
  invoiceType: string;
  fullNumber: string | null;
  partyName: string | null;
  issueDate: string | null;
  dueDate: string | null;
  total: string;
  paidTotal: string;
  fiscalStatus: string;
  overdueDays: number | null;
  // Clave de orden, solo para construir el cursor de la página siguiente.
  kDraft: boolean;
  kSortDate: string;
  kCreatedAt: string;
}

/** Filtros comunes a la página y al total pendiente. */
function filters(tx: Tx, ctx: TenantContext, q: InvoiceListQuery) {
  const term = q.search ? `%${q.search.replace(/[\\%_]/g, '\\$&')}%` : null;
  return tx`
    ${orgScope(tx, ctx, 'i.organization_id')}
    and i.direction = ${q.direction}
    ${statusFilter(tx, q.status)}
    ${kindFilter(tx, q.kind)}
    ${q.partyId ? tx`and i.party_id = ${q.partyId}::uuid` : tx``}
    ${term ? tx`and (i.full_number ilike ${term} or p.legal_name ilike ${term})` : tx``}`;
}

function statusFilter(tx: Tx, status: InvoiceListQuery['status']) {
  switch (status) {
    case undefined:
      return tx``;
    case 'unpaid':
      return tx`and i.status in ('issued', 'partially_paid')`;
    case 'overdue':
      return tx`and i.status in ('issued', 'partially_paid') and i.due_date < current_date`;
    default:
      return tx`and i.status = ${status}`;
  }
}

function kindFilter(tx: Tx, kind: InvoiceListQuery['kind']) {
  switch (kind) {
    case undefined:
      return tx``;
    case 'invoice':
      return tx`and i.invoice_type in ('F1', 'F3')`;
    case 'corrective':
      return tx`and i.invoice_type like 'R%'`;
    case 'ticket':
      return tx`and i.invoice_type = 'F2'`;
  }
}

/**
 * Una página. Pide `limit + 1` filas: si llega la extra, hay página siguiente
 * (así no hace falta un COUNT(*), que recorrería todo el histórico).
 *
 * La comparación del cursor es una comparación de filas sobre columnas simples
 * y en el mismo orden que el índice; no envolverla en funciones (coalesce, casts
 * de columna…) o con RLS deja de entrar en el índice. Ver migración 0023.
 *
 * `::text::timestamptz` no es redundante: si el parámetro se declara timestamptz,
 * postgres.js lo pasa por un Date de JavaScript y trunca los microsegundos; el
 * cursor caería antes de su fila y se saltarían las facturas empatadas.
 */
export async function findInvoicePage(tx: Tx, ctx: TenantContext, q: InvoiceListQuery, after: InvoiceCursor | null) {
  return asRows<PageRow>(await tx`
    select i.id, i.direction, i.status, i.invoice_type, i.full_number, p.legal_name as party_name,
           i.issue_date::text, i.due_date::text, i.total::text, i.paid_total::text, i.fiscal_status,
           case when i.status in ('issued', 'partially_paid') and i.due_date < current_date
                then (current_date - i.due_date) end as overdue_days,
           (i.status = 'draft') as k_draft,
           i.sort_date::text as k_sort_date,
           to_json(i.created_at) #>> '{}' as k_created_at
    from invoices i
    left join parties p on p.id = i.party_id
    where ${filters(tx, ctx, q)}
      ${after
        ? tx`and ((i.status = 'draft'), i.sort_date, i.created_at, i.id)
               < (${after.draft}::boolean, ${after.sortDate}::date, ${after.createdAt}::text::timestamptz, ${after.id}::uuid)`
        : tx``}
    order by (i.status = 'draft') desc, i.sort_date desc, i.created_at desc, i.id desc
    limit ${q.limit + 1}`);
}

/**
 * Pendiente de todo el filtro con un único agregado en la base. Solo cuenta
 * facturas vivas, que es justo el predicado de `invoices_outstanding_idx`.
 */
export async function sumOutstanding(tx: Tx, ctx: TenantContext, q: InvoiceListQuery): Promise<string> {
  const [row] = await tx<{ outstanding: string }[]>`
    select coalesce(sum(i.total - i.paid_total), 0)::text as outstanding
    from invoices i
    ${q.search ? tx`left join parties p on p.id = i.party_id` : tx``}
    where ${filters(tx, ctx, q)}
      and i.status in ('issued', 'partially_paid')`;
  return row!.outstanding;
}
