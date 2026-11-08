-- =====================================================================
-- Omnia · 0027 · Estadísticas de un día (Estadísticas › Comparación)
--
-- Cifras de un día para compararlo con otro, también con el día en curso en
-- tiempo real. Como el resto de app.stats_*: DEFINER, exige stats.read y solo
-- devuelve agregados. Horas en hora peninsular española.
--
-- Ventas: facturas y tickets emitidos con fecha de expedición ese día (las
-- rectificativas restan). La hora es la del registro de facturación
-- (fiscal_record_at); si se expidió con otra fecha (p. ej. una factura con
-- fecha atrasada) no tiene hora fiable y cuenta aparte, como «sin hora».
--
-- p_until (opcional): además, lo vendido hasta esa hora del día. Sirve para
-- comparar «hoy hasta ahora» con otro día «hasta la misma hora».
-- =====================================================================

create or replace function app.stats_day(p_org uuid, p_day date, p_until time default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz    constant text := 'Europe/Madrid';
  v_today date := (now() at time zone v_tz)::date;
  v_out   jsonb;
begin
  if not app.has_permission(p_org, 'stats.read') then
    raise exception 'Ver estadísticas requiere el permiso correspondiente' using errcode = '42501';
  end if;

  with sales as (
    select i.id, i.total, i.subtotal, i.tax_total,
           (i.invoice_type = 'F2' and i.party_id is null) as is_pos,
           case when (i.fiscal_record_at at time zone v_tz)::date = i.issue_date
                then (i.fiscal_record_at at time zone v_tz)::time end as at_time
    from public.invoices i
    where i.organization_id = p_org
      and i.direction = 'issued'
      and i.status in ('issued', 'partially_paid', 'paid')
      and i.issue_date = p_day
  ),
  hours as (
    select h, coalesce(sum(s.total), 0) as total, count(s.id)::int as n
    from generate_series(0, 23) h
    left join sales s on extract(hour from s.at_time)::int = h
    group by h
  ),
  methods as (
    select p.method, sum(p.amount) as amount
    from public.invoice_payments p
    join sales s on s.id = p.invoice_id
    group by p.method
  ),
  tabs as (
    select coalesce(sum(t.guests), 0)::int as guests, count(*)::int as n
    from public.pos_tabs t
    where t.organization_id = p_org and t.status = 'paid'
      and (t.closed_at at time zone v_tz)::date = p_day
  ),
  open_tabs as (
    select count(distinct t.id)::int as n,
           coalesce(round(sum(l.quantity * l.unit_price * (1 - l.discount_pct / 100)
                              * (1 - coalesce(t.staff_discount_pct, 0) / 100) * (1 + l.tax_rate / 100)), 2), 0) as total
    from public.pos_tabs t
    left join public.pos_tab_lines l on l.tab_id = t.id and l.organization_id = t.organization_id
    where t.organization_id = p_org and t.status in ('open', 'billing') and p_day = v_today
  )
  select jsonb_build_object(
    'day', p_day,
    'isToday', p_day = v_today,
    'now', to_char(now() at time zone v_tz, 'HH24:MI'),
    'total', coalesce((select sum(total) from sales), 0),
    'base', coalesce((select sum(subtotal) from sales), 0),
    'tax', coalesce((select sum(tax_total) from sales), 0),
    'count', (select count(*) from sales),
    'posTotal', coalesce((select sum(total) from sales where is_pos), 0),
    'posCount', (select count(*) from sales where is_pos),
    'untimedTotal', coalesce((select sum(total) from sales where at_time is null), 0),
    'untilTotal', case when p_until is null then null else coalesce((select sum(total) from sales where at_time <= p_until), 0) end,
    'untilCount', case when p_until is null then null else (select count(*) from sales where at_time <= p_until) end,
    'guests', (select guests from tabs),
    'cash', coalesce((select amount from methods where method = 'cash'), 0),
    'card', coalesce((select amount from methods where method = 'card'), 0),
    'otherPayments', coalesce((select sum(amount) from methods where method not in ('cash', 'card')), 0),
    'openTabs', (select n from open_tabs),
    'openTotal', (select total from open_tabs),
    'hourly', (select jsonb_agg(jsonb_build_object('hour', h, 'total', total, 'count', n) order by h) from hours)
  ) into v_out;

  return v_out;
end
$$;
revoke all on function app.stats_day(uuid, date, time) from public;
grant execute on function app.stats_day(uuid, date, time) to app_user;
