-- =====================================================================
-- Omnia · 0022 · Estadísticas financieras
--
-- Cuadro de mando, cuenta de resultados, estados financieros e informes de
-- gestión salen de dos funciones que devuelven solo agregados: quien tiene
-- stats.read ve las cifras sin necesitar acceso a cada factura o nómina.
--
-- Las cifras son de gestión, no contabilidad oficial: los gastos son las
-- facturas recibidas (aprovisionamientos si la línea es de un artículo
-- inventariable), el personal es el líquido de las nóminas subidas y la
-- tesorería es lo cobrado y pagado que consta en Omnia.
-- =====================================================================

insert into public.permissions (code, module, description) values
  ('stats.*',    'stats', 'Todo sobre estadísticas'),
  ('stats.read', 'stats', 'Ver estadísticas financieras: cuadro de mando, resultados e informes');

create or replace function app.seed_stats_permissions(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.role_permissions (organization_id, role_id, permission_code)
  select r.organization_id, r.id, 'stats.*'
  from public.roles r
  where r.organization_id = p_org and r.key = 'admin'
  on conflict do nothing;
$$;
revoke all on function app.seed_stats_permissions(uuid) from public;

select app.seed_stats_permissions(id) from public.organizations;

create or replace function app.seed_stats_permissions_on_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.seed_stats_permissions(new.organization_id);
  return new;
end
$$;
create trigger roles_seed_stats after insert on public.roles
  for each row when (new.key = 'admin') execute function app.seed_stats_permissions_on_role();

-- Una fila por mes entre p_from y p_to (ambos incluidos, se redondean al mes).
-- Bases sin impuestos; las rectificativas restan porque sus líneas van en negativo.
create or replace function app.stats_monthly(p_org uuid, p_from date, p_to date)
returns table (
  month          date,
  sales_base     numeric,   -- facturación (sin IVA)
  sales_tax      numeric,
  pos_base       numeric,   -- de ella, tickets del TPV
  invoices_count integer,
  supplies_base  numeric,   -- compras de artículos inventariables
  expenses_base  numeric,   -- resto de facturas recibidas (servicios, suministros…)
  purchases_tax  numeric,
  payroll_net    numeric,   -- líquido de nóminas
  collected      numeric,   -- cobros de clientes
  paid_out       numeric    -- pagos a proveedores
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_permission(p_org, 'stats.read') then
    raise exception 'Ver estadísticas requiere el permiso correspondiente' using errcode = '42501';
  end if;
  return query
  with months as (
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as m
  ),
  live as (
    select i.* from public.invoices i
    where i.organization_id = p_org and i.status in ('issued', 'partially_paid', 'paid')
      and i.issue_date >= date_trunc('month', p_from) and i.issue_date < date_trunc('month', p_to) + interval '1 month'
  ),
  sales as (
    select date_trunc('month', issue_date)::date as m, sum(subtotal) as base, sum(tax_total) as tax,
           sum(subtotal) filter (where invoice_type = 'F2' and party_id is null) as pos, count(*)::int as n
    from live where direction = 'issued' group by 1
  ),
  purchases as (
    select date_trunc('month', i.issue_date)::date as m,
           coalesce(sum(l.line_base) filter (where it.item_type = 'stockable'), 0) as supplies,
           coalesce(sum(l.line_base) filter (where it.item_type is distinct from 'stockable'), 0) as other,
           sum(l.line_tax) as tax
    from live i
    join public.invoice_lines l on l.invoice_id = i.id
    left join public.inventory_items it on it.id = l.item_id
    where i.direction = 'received' group by 1
  ),
  payroll as (
    select period as m, sum(net_amount) as net
    from public.payslips
    where organization_id = p_org and period between date_trunc('month', p_from) and date_trunc('month', p_to)
    group by 1
  ),
  payments as (
    select date_trunc('month', p.paid_at)::date as m,
           sum(p.amount) filter (where i.direction = 'issued') as cin,
           sum(p.amount) filter (where i.direction = 'received') as cout
    from public.invoice_payments p join public.invoices i on i.id = p.invoice_id
    where p.organization_id = p_org
      and p.paid_at >= date_trunc('month', p_from) and p.paid_at < date_trunc('month', p_to) + interval '1 month'
    group by 1
  )
  select months.m,
         coalesce(s.base, 0), coalesce(s.tax, 0), coalesce(s.pos, 0), coalesce(s.n, 0),
         coalesce(pu.supplies, 0), coalesce(pu.other, 0), coalesce(pu.tax, 0),
         coalesce(pr.net, 0), coalesce(pa.cin, 0), coalesce(pa.cout, 0)
  from months
  left join sales s on s.m = months.m
  left join purchases pu on pu.m = months.m
  left join payroll pr on pr.m = months.m
  left join payments pa on pa.m = months.m
  order by months.m;
end
$$;
revoke all on function app.stats_monthly(uuid, date, date) from public;
grant execute on function app.stats_monthly(uuid, date, date) to app_user;

-- Foto de hoy para el balance: lo que se debe y lo que nos deben, existencias,
-- efectivo en las cajas abiertas del TPV e IVA del trimestre en curso.
create or replace function app.stats_snapshot(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_quarter date := date_trunc('quarter', current_date)::date;
begin
  if not app.has_permission(p_org, 'stats.read') then
    raise exception 'Ver estadísticas requiere el permiso correspondiente' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'receivable', (select coalesce(sum(total - paid_total), 0) from public.invoices
                   where organization_id = p_org and direction = 'issued' and status in ('issued', 'partially_paid')),
    'receivableOverdue', (select coalesce(sum(total - paid_total), 0) from public.invoices
                   where organization_id = p_org and direction = 'issued' and status in ('issued', 'partially_paid') and due_date < current_date),
    'payable', (select coalesce(sum(total - paid_total), 0) from public.invoices
                where organization_id = p_org and direction = 'received' and status in ('issued', 'partially_paid')),
    'payableOverdue', (select coalesce(sum(total - paid_total), 0) from public.invoices
                where organization_id = p_org and direction = 'received' and status in ('issued', 'partially_paid') and due_date < current_date),
    'inventory', (select coalesce(round(sum(on_hand * avg_unit_cost), 2), 0) from public.stock_levels where organization_id = p_org),
    'cashInRegisters', (select coalesce(sum((app.cash_session_summary(s.id) ->> 'expectedCash')::numeric), 0)
                        from public.cash_sessions s where s.organization_id = p_org and s.status = 'open'),
    'vatOutput', (select coalesce(sum(tax_total), 0) from public.invoices
                  where organization_id = p_org and direction = 'issued' and status in ('issued', 'partially_paid', 'paid') and issue_date >= v_quarter),
    'vatInput', (select coalesce(sum(tax_total), 0) from public.invoices
                 where organization_id = p_org and direction = 'received' and status in ('issued', 'partially_paid', 'paid') and issue_date >= v_quarter),
    'quarterStart', v_quarter,
    'topCustomers', coalesce((
      select jsonb_agg(c order by c.base desc) from (
        select p.legal_name as name, sum(i.subtotal) as base, count(*)::int as invoices
        from public.invoices i join public.parties p on p.id = i.party_id
        where i.organization_id = p_org and i.direction = 'issued' and i.status in ('issued', 'partially_paid', 'paid')
          and i.issue_date >= date_trunc('year', current_date)
        group by 1 order by 2 desc limit 5
      ) c), '[]'::jsonb)
  );
end
$$;
revoke all on function app.stats_snapshot(uuid) from public;
grant execute on function app.stats_snapshot(uuid) to app_user;
