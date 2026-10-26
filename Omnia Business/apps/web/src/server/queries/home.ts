import 'server-only';
import type { TenantContext } from '@omnia/core';
import { asRows, withTenant } from '@omnia/db';
import { container } from '../container';

// Modelo de lectura del panel de Inicio. Todo pasa por RLS: si el rol no tiene
// permiso sobre un módulo, sus consultas devuelven vacío (y la UI oculta el panel).

export async function homeSummary(ctx: TenantContext) {
  return withTenant(container().sql, ctx, async (tx) => {
    const [money] = await tx<
      {
        pending: string; invoices: number; overdue_count: number; overdue_amount: string;
        collected: string; issued: string; fiscal_accepted: number; fiscal_pending: number; fiscal_rejected: number;
      }[]
    >`
      select
        coalesce(sum(total - paid_total) filter (where direction = 'issued' and status in ('issued','partially_paid')), 0)::text as pending,
        count(*) filter (where direction = 'issued' and status in ('issued','partially_paid'))::int as invoices,
        count(*) filter (where direction = 'issued' and status in ('issued','partially_paid') and due_date < current_date)::int as overdue_count,
        coalesce(sum(total - paid_total) filter (where direction = 'issued' and status in ('issued','partially_paid') and due_date < current_date), 0)::text as overdue_amount,
        coalesce((select sum(p.amount) from invoice_payments p join invoices i on i.id = p.invoice_id
                  where i.direction = 'issued' and p.paid_at >= date_trunc('month', current_date)), 0)::text as collected,
        coalesce(sum(total) filter (where direction = 'issued' and status <> 'draft' and status <> 'cancelled'
                                     and issue_date >= date_trunc('month', current_date)), 0)::text as issued,
        count(*) filter (where fiscal_status = 'accepted' and fiscal_record_at >= date_trunc('month', current_date))::int as fiscal_accepted,
        count(*) filter (where fiscal_status = 'pending')::int as fiscal_pending,
        count(*) filter (where fiscal_status = 'rejected')::int as fiscal_rejected
      from invoices`;

    const rejected = asRows<{ id: string; fullNumber: string }>(await tx`
      select id, full_number from invoices where fiscal_status = 'rejected' order by fiscal_record_at desc limit 1`);

    const overdue = asRows<{ id: string; fullNumber: string; customer: string; dueDate: string; days: number; amount: string }>(await tx`
      select i.id, i.full_number, p.legal_name as customer, i.due_date::text, (current_date - i.due_date) as days,
             (i.total - i.paid_total)::text as amount
      from invoices i join parties p on p.id = i.party_id
      where i.direction = 'issued' and i.status in ('issued','partially_paid') and i.due_date < current_date
      order by i.due_date limit 5`);

    const lowStock = asRows<{ itemId: string; item: string; onHand: string; minimum: string; unit: string; warehouse: string }>(await tx`
      select sl.item_id, i.name as item, sl.on_hand::text, sl.min_quantity::text as minimum, i.unit_of_measure as unit, w.name as warehouse
      from stock_levels sl join inventory_items i on i.id = sl.item_id join warehouses w on w.id = sl.warehouse_id
      where sl.min_quantity > 0 and sl.on_hand <= sl.min_quantity
      order by sl.on_hand / nullif(sl.min_quantity, 0) limit 5`);
    const low_stock_count = (await tx<{ low_stock_count: number }[]>`
      select count(*)::int as low_stock_count from stock_levels where min_quantity > 0 and on_hand <= min_quantity`)[0]!.low_stock_count;

    const drafts = (await tx<{ drafts: number }[]>`select count(*)::int as drafts from goods_receipts where status = 'draft'`)[0]!.drafts;

    const incidents = asRows<{ id: string; title: string; priority: 'urgent' | 'high' | 'normal' | 'low' }>(await tx`
      select id, title, priority from incidents where status not in ('resolved','closed')
      order by array_position(array['urgent','high','normal','low'], priority), created_at desc limit 4`);
    const open_incidents = (await tx<{ open_incidents: number }[]>`
      select count(*)::int as open_incidents from incidents where status not in ('resolved','closed')`)[0]!.open_incidents;

    const upcoming = asRows<{ id: string; date: string; kind: 'cobro' | 'pago'; party: string; document: string; amount: string }>(await tx`
      select i.id, i.due_date::text as date, case when i.direction = 'issued' then 'cobro' else 'pago' end as kind,
             p.legal_name as party, i.full_number as document, (i.total - i.paid_total)::text as amount
      from invoices i join parties p on p.id = i.party_id
      where i.status in ('issued','partially_paid') and i.due_date between current_date and current_date + 14
      order by i.due_date, i.direction limit 8`);

    const [staff] = await tx<{ staff: number; present: number; on_leave: number }[]>`
      select (select count(*)::int from user_organizations where status = 'active' and organization_id = ${ctx.organizationIds[0]}) as staff,
             (select count(distinct user_id)::int from time_entries where entry_type = 'clock_in' and occurred_at >= current_date) as present,
             (select count(*)::int from leave_requests where status = 'approved' and current_date between starts_on and ends_on) as on_leave`;

    const missing = asRows<{ userId: string; name: string; startsAt: Date; area: string | null }>(await tx`
      select s.user_id, u.full_name as name, s.starts_at, s.area
      from shifts s join users u on u.id = s.user_id
      where s.starts_at >= current_date and s.starts_at < current_date + 1 and s.starts_at < now()
        and not exists (select 1 from time_entries e where e.user_id = s.user_id and e.entry_type = 'clock_in' and e.occurred_at >= current_date)
        and not exists (select 1 from leave_requests l where l.user_id = s.user_id and l.status = 'approved' and current_date between l.starts_on and l.ends_on)
      order by s.starts_at`);

    const pending_leaves = (await tx<{ pending_leaves: number }[]>`
      select count(*)::int as pending_leaves from leave_requests where status = 'requested' and user_id <> ${ctx.userId}`)[0]!.pending_leaves;

    return {
      money: money!,
      rejected: rejected[0] ?? null,
      overdue,
      lowStock,
      lowStockCount: low_stock_count,
      drafts,
      incidents,
      openIncidents: open_incidents,
      upcoming,
      staff: staff!,
      missing,
      pendingLeaves: pending_leaves,
    };
  });
}
