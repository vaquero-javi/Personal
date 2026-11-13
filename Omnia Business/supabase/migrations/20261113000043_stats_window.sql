-- =====================================================================
-- Omnia · 0043 · Estadísticas de un tramo horario (Estadísticas › Comparación)
--
-- Como app.stats_day, pero solo entre dos horas del día: p. ej. de 13:00 a
-- 16:00 (comidas) o de 20:00 a 03:00 (noche). Si la hora de fin es igual o
-- anterior a la de inicio, el tramo sigue en la madrugada del día siguiente
-- (bares y discotecas cierran después de medianoche). Horas en hora
-- peninsular española.
--
-- Ventas: facturas y tickets emitidos con su registro de facturación
-- (fiscal_record_at) dentro del tramo. Las expedidas con otra fecha (sin hora
-- fiable) no entran: en un tramo horario no se pueden situar.
--
-- p_until_minutes (opcional): además, lo vendido en los primeros N minutos del
-- tramo. Sirve para comparar un tramo de hoy en curso con el mismo punto del
-- tramo de otro día.
-- =====================================================================

create or replace function app.stats_window(p_org uuid, p_day date, p_from time, p_to time, p_until_minutes integer default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz    constant text := 'Europe/Madrid';
  v_start timestamptz := (p_day + p_from) at time zone v_tz;
  v_end   timestamptz := ((p_day + case when p_to <= p_from then 1 else 0 end) + p_to) at time zone v_tz;
  v_live  boolean := now() >= v_start and now() < v_end;
  v_out   jsonb;
begin
  if not app.has_permission(p_org, 'stats.read') then
    raise exception 'Ver estadísticas requiere el permiso correspondiente' using errcode = '42501';
  end if;
  if p_until_minutes is not null and p_until_minutes < 0 then
    raise exception 'Minutos no válidos' using errcode = '22023';
  end if;

  with sales as (
    select i.id, i.total, i.subtotal, i.tax_total, i.fiscal_record_at as at,
           (i.invoice_type = 'F2' and i.party_id is null) as is_pos
    from public.invoices i
    where i.organization_id = p_org
      and i.direction = 'issued'
      and i.status in ('issued', 'partially_paid', 'paid')
      and i.fiscal_record_at >= v_start and i.fiscal_record_at < v_end
      -- Solo lo expedido el mismo día de su registro (lo atrasado no tiene hora fiable).
      and (i.fiscal_record_at at time zone v_tz)::date = i.issue_date
  ),
  slots as (
    select s as slot_start, row_number() over (order by s) as n
    from generate_series(v_start, v_end - interval '1 second', interval '1 hour') s
  ),
  hours as (
    select sl.n, extract(hour from sl.slot_start at time zone v_tz)::int as h,
           coalesce(sum(s.total), 0) as total, count(s.id)::int as cnt
    from slots sl
    left join sales s on s.at >= sl.slot_start and s.at < sl.slot_start + interval '1 hour'
    group by sl.n, sl.slot_start
  ),
  methods as (
    select p.method, sum(p.amount) as amount
    from public.invoice_payments p
    join sales s on s.id = p.invoice_id
    group by p.method
  ),
  tabs as (
    select coalesce(sum(t.guests), 0)::int as guests
    from public.pos_tabs t
    where t.organization_id = p_org and t.status = 'paid'
      and t.closed_at >= v_start and t.closed_at < v_end
  ),
  open_tabs as (
    select count(distinct t.id)::int as n,
           coalesce(round(sum(l.quantity * l.unit_price * (1 - l.discount_pct / 100)
                              * (1 - coalesce(t.staff_discount_pct, 0) / 100) * (1 + l.tax_rate / 100)), 2), 0) as total
    from public.pos_tabs t
    left join public.pos_tab_lines l on l.tab_id = t.id and l.organization_id = t.organization_id
    where t.organization_id = p_org and t.status in ('open', 'billing') and v_live
  )
  select jsonb_build_object(
    'day', p_day,
    'from', to_char(p_from, 'HH24:MI'),
    'to', to_char(p_to, 'HH24:MI'),
    'overnight', p_to <= p_from,
    'isToday', v_live,
    'now', to_char(now() at time zone v_tz, 'HH24:MI'),
    'elapsedMinutes', case when v_live then floor(extract(epoch from now() - v_start) / 60)::int end,
    'total', coalesce((select sum(total) from sales), 0),
    'base', coalesce((select sum(subtotal) from sales), 0),
    'tax', coalesce((select sum(tax_total) from sales), 0),
    'count', (select count(*) from sales),
    'posTotal', coalesce((select sum(total) from sales where is_pos), 0),
    'posCount', (select count(*) from sales where is_pos),
    'untimedTotal', 0,
    'untilTotal', case when p_until_minutes is null then null
                       else coalesce((select sum(total) from sales where at < v_start + make_interval(mins => p_until_minutes)), 0) end,
    'untilCount', case when p_until_minutes is null then null
                       else (select count(*) from sales where at < v_start + make_interval(mins => p_until_minutes)) end,
    'guests', (select guests from tabs),
    'cash', coalesce((select amount from methods where method = 'cash'), 0),
    'card', coalesce((select amount from methods where method = 'card'), 0),
    'otherPayments', coalesce((select sum(amount) from methods where method not in ('cash', 'card')), 0),
    'openTabs', (select n from open_tabs),
    'openTotal', (select total from open_tabs),
    'hourly', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'total', total, 'count', cnt) order by n) from hours), '[]'::jsonb)
  ) into v_out;

  return v_out;
end
$$;
revoke all on function app.stats_window(uuid, date, time, time, integer) from public;
grant execute on function app.stats_window(uuid, date, time, time, integer) to app_user;
