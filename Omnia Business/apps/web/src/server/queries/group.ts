import 'server-only';
import type { TenantContext } from '@omnia/core';
import { asRows, withTenant } from '@omnia/db';
import { container } from '../container';

export interface CompanyFigures {
  organizationId: string;
  pending: string;
  overdue: string;
  overdueCount: number;
  issuedMonth: string;
  collectedMonth: string;
  payable: string;
  stockValue: string;
  lowStock: number;
  openIncidents: number;
}

/**
 * Vista consolidada: una consulta sobre varias sociedades a la vez
 * (app.org_ids = todas las pedidas). La RLS filtra cada sociedad según el
 * permiso del usuario en ella, así que las cifras de una sociedad donde no
 * puede ver facturación salen a cero, nunca filtradas de otra.
 */
export async function groupFigures(ctx: TenantContext): Promise<CompanyFigures[]> {
  return withTenant(container().sql, ctx, async (tx) =>
    asRows<CompanyFigures>(await tx`
      with orgs as (select unnest(${`{${ctx.organizationIds.join(',')}}`}::uuid[]) as id),
      inv as (
        select organization_id,
          sum(total - paid_total) filter (where direction = 'issued' and status in ('issued','partially_paid')) as pending,
          sum(total - paid_total) filter (where direction = 'issued' and status in ('issued','partially_paid') and due_date < current_date) as overdue,
          count(*) filter (where direction = 'issued' and status in ('issued','partially_paid') and due_date < current_date) as overdue_count,
          sum(total) filter (where direction = 'issued' and status not in ('draft','cancelled') and issue_date >= date_trunc('month', current_date)) as issued_month,
          sum(total - paid_total) filter (where direction = 'received' and status in ('issued','partially_paid')) as payable
        from invoices group by organization_id
      ),
      pay as (
        select p.organization_id, sum(p.amount) as collected
        from invoice_payments p join invoices i on i.id = p.invoice_id
        where i.direction = 'issued' and p.paid_at >= date_trunc('month', current_date)
        group by p.organization_id
      ),
      stk as (
        select organization_id, sum(on_hand * avg_unit_cost) as value,
               count(*) filter (where min_quantity > 0 and on_hand <= min_quantity) as low
        from stock_levels group by organization_id
      ),
      inc as (select organization_id, count(*) as open from incidents where status not in ('resolved','closed') group by organization_id)
      select o.id as organization_id,
             coalesce(inv.pending, 0)::numeric(18,2)::text as pending,
             coalesce(inv.overdue, 0)::numeric(18,2)::text as overdue,
             coalesce(inv.overdue_count, 0)::int as overdue_count,
             coalesce(inv.issued_month, 0)::numeric(18,2)::text as issued_month,
             coalesce(pay.collected, 0)::numeric(18,2)::text as collected_month,
             coalesce(inv.payable, 0)::numeric(18,2)::text as payable,
             coalesce(stk.value, 0)::numeric(18,2)::text as stock_value,
             coalesce(stk.low, 0)::int as low_stock,
             coalesce(inc.open, 0)::int as open_incidents
      from orgs o
      left join inv on inv.organization_id = o.id
      left join pay on pay.organization_id = o.id
      left join stk on stk.organization_id = o.id
      left join inc on inc.organization_id = o.id`),
  );
}
