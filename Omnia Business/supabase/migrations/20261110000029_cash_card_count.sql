-- =====================================================================
-- Omnia · 0029 · Cierre de caja con tarjeta y traspasos entre formas de pago
--
-- 1. El cierre recoge también lo cobrado con tarjeta según el datáfono
--    (counted_card) y lo compara con lo que dice el TPV (expected_card).
-- 2. Traspasos efectivo ↔ tarjeta: corrigen un cobro registrado con la forma
--    de pago equivocada (p. ej. se cobró en efectivo y se marcó tarjeta).
--    Son movimientos de caja (append-only, con quién y cuándo): el ticket
--    fiscal y su cobro no se tocan. Si se indica el ticket, el traspaso es por
--    su importe, solo uno por ticket y en la dirección de su forma de pago.
--    Ventas en efectivo/tarjeta y efectivo esperado ya los incluyen.
-- =====================================================================

alter table public.cash_movements drop constraint cash_movements_kind_check;
alter table public.cash_movements
  add constraint cash_movements_kind_check check (kind in ('withdrawal', 'deposit', 'cash_to_card', 'card_to_cash')),
  add column invoice_id uuid,
  add foreign key (organization_id, invoice_id) references public.invoices (organization_id, id),
  add check (invoice_id is null or kind in ('cash_to_card', 'card_to_cash'));
create unique index cash_movements_one_per_ticket on public.cash_movements (organization_id, invoice_id) where invoice_id is not null;

alter table public.cash_sessions
  add column counted_card    numeric(18, 2) check (counted_card >= 0),
  add column expected_card   numeric(18, 2),
  add column card_difference numeric(18, 2);

create or replace function app.cash_session_summary(p_session uuid) returns jsonb
language sql stable as $$
  with s as (
    select * from public.cash_sessions where id = p_session
  ),
  pays as (
    select p.invoice_id, p.method, p.amount from public.invoice_payments p, s
    where p.organization_id = s.organization_id and p.cash_session_id = s.id
  ),
  inv as (
    select i.id, i.full_number, i.fiscal_record_at, i.number from public.invoices i
    where i.id in (select invoice_id from pays)
  ),
  mov as (
    select m.kind, m.amount from public.cash_movements m, s
    where m.organization_id = s.organization_id and m.cash_session_id = s.id
  ),
  tabs as (
    select t.* from public.pos_tabs t, s
    where t.organization_id = s.organization_id and t.cash_session_id = s.id
  ),
  totals as (
    select
      coalesce(sum(amount) filter (where method = 'cash'), 0) as cash,
      coalesce(sum(amount) filter (where method = 'card'), 0) as card,
      coalesce(sum(amount), 0) as total,
      count(distinct invoice_id) as tickets
    from pays
  ),
  moves as (
    select coalesce(sum(amount) filter (where kind = 'deposit'), 0) as deposits,
           coalesce(sum(amount) filter (where kind = 'withdrawal'), 0) as withdrawals,
           coalesce(sum(amount) filter (where kind = 'cash_to_card'), 0) as cash_to_card,
           coalesce(sum(amount) filter (where kind = 'card_to_cash'), 0) as card_to_cash
    from mov
  )
  select jsonb_build_object(
    'openingFloat', s.opening_float,
    -- Ventas por forma de pago ya corregidas con los traspasos.
    'cashSales', totals.cash - moves.cash_to_card + moves.card_to_cash,
    'cardSales', totals.card + moves.cash_to_card - moves.card_to_cash,
    -- Tal como se marcaron al cobrar en el TPV.
    'cashRecorded', totals.cash,
    'cardRecorded', totals.card,
    'cashToCard', moves.cash_to_card,
    'cardToCash', moves.card_to_cash,
    'totalSales', totals.total,
    'tickets', totals.tickets,
    'deposits', moves.deposits,
    'withdrawals', moves.withdrawals,
    'expectedCash', s.opening_float + totals.cash - moves.cash_to_card + moves.card_to_cash + moves.deposits - moves.withdrawals,
    'expectedCard', totals.card + moves.cash_to_card - moves.card_to_cash,
    'averageTicket', case when totals.tickets > 0 then round(totals.total / totals.tickets, 2) else 0 end,
    'firstTicket', (select full_number from inv order by fiscal_record_at, number limit 1),
    'lastTicket', (select full_number from inv order by fiscal_record_at desc, number desc limit 1),
    'taxes', coalesce((
      select jsonb_agg(jsonb_build_object('rate', rate, 'base', base, 'tax', tax) order by rate)
      from (
        select l.tax_rate as rate, sum(l.line_base) as base, sum(l.line_tax) as tax
        from public.invoice_lines l where l.invoice_id in (select id from inv)
        group by l.tax_rate
      ) x
    ), '[]'::jsonb),
    'byWaiter', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'tickets', n, 'total', total) order by total desc)
      from (
        select coalesce(u.full_name, u.email) as name, count(*) as n, sum(i.total) as total
        from tabs t
        join public.invoices i on i.id = t.invoice_id
        join public.users u on u.id = t.waiter_id
        where t.status = 'paid'
        group by u.id
      ) x
    ), '[]'::jsonb),
    'topProducts', coalesce((
      select jsonb_agg(jsonb_build_object('name', description, 'quantity', qty, 'total', total) order by qty desc, description)
      from (
        select l.description, sum(l.quantity) as qty, sum(l.line_base + l.line_tax) as total
        from public.invoice_lines l where l.invoice_id in (select id from inv)
        group by l.description
        order by sum(l.quantity) desc, l.description
        limit 10
      ) x
    ), '[]'::jsonb),
    'cancelledTabs', (select count(*) from tabs where status = 'cancelled')
  )
  from s, totals, moves
$$;

-- Movimientos: la caja tiene que estar abierta; un traspaso no puede sacar de
-- una forma de pago más de lo que se ha vendido con ella, y si va ligado a un
-- ticket, ese ticket es de esta caja, se cobró con la forma de origen y el
-- importe es el suyo.
create or replace function app.guard_cash_movement() returns trigger
language plpgsql as $$
declare
  v_summary jsonb;
  v_source  text;
  v_ticket  record;
begin
  -- Dos traspasos a la vez en la misma caja no pueden pasarse del disponible.
  -- Bloqueo consultivo y no FOR UPDATE: app_user no tiene UPDATE sobre cash_sessions.
  perform pg_advisory_xact_lock(hashtextextended('cash_session:' || new.cash_session_id::text, 0));
  perform 1 from public.cash_sessions
  where organization_id = new.organization_id and id = new.cash_session_id and status = 'open';
  if not found then
    raise exception 'La caja está cerrada' using errcode = 'OM002';
  end if;
  if new.kind in ('cash_to_card', 'card_to_cash') then
    v_source := case new.kind when 'cash_to_card' then 'cash' else 'card' end;
    if new.invoice_id is not null then
      select p.method, p.amount, i.full_number into v_ticket
      from public.invoice_payments p join public.invoices i on i.id = p.invoice_id
      where p.organization_id = new.organization_id and p.invoice_id = new.invoice_id and p.cash_session_id = new.cash_session_id;
      if not found then
        raise exception 'Ese ticket no se cobró en esta caja' using errcode = 'OM002';
      end if;
      if v_ticket.method <> v_source then
        raise exception 'El ticket % se cobró en %', v_ticket.full_number, case v_ticket.method when 'cash' then 'efectivo' else 'tarjeta' end using errcode = 'OM002';
      end if;
      if new.amount <> v_ticket.amount then
        raise exception 'El traspaso de un ticket es por su importe (%)', v_ticket.amount using errcode = 'OM002';
      end if;
    end if;
    v_summary := app.cash_session_summary(new.cash_session_id);
    if new.amount > (v_summary ->> case v_source when 'cash' then 'cashSales' else 'cardSales' end)::numeric then
      raise exception 'No se puede pasar más de lo vendido en %', case v_source when 'cash' then 'efectivo' else 'tarjeta' end using errcode = 'OM002';
    end if;
  end if;
  return new;
end
$$;

-- Cierre con arqueo del efectivo y, ahora, del datáfono. p_counted_card es
-- opcional para no romper llamadas antiguas; el TPV siempre lo envía.
drop function app.close_cash_session(uuid, numeric, jsonb, text);
create function app.close_cash_session(p_session uuid, p_counted numeric, p_detail jsonb, p_notes text, p_counted_card numeric default null)
returns public.cash_sessions
language plpgsql security definer set search_path = '' as $$
declare
  v_s       public.cash_sessions;
  v_summary jsonb;
begin
  select * into v_s from public.cash_sessions where id = p_session for update;
  if not found or not (v_s.organization_id in (select app.authorized_org_ids('pos.manage'))) then
    raise exception 'Caja no encontrada' using errcode = 'P0002';
  end if;
  if v_s.status <> 'open' then
    raise exception 'La caja ya está cerrada' using errcode = 'OM002';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Indica el efectivo contado' using errcode = 'OM002';
  end if;
  if p_counted_card < 0 then
    raise exception 'El total del datáfono no puede ser negativo' using errcode = 'OM002';
  end if;
  if exists (
       select 1 from public.pos_tabs
       where organization_id = v_s.organization_id and terminal_id = v_s.terminal_id and status in ('open', 'billing')
     ) then
    raise exception 'Hay cuentas abiertas en este terminal: cóbralas o anúlalas antes de cerrar' using errcode = 'OM002';
  end if;

  v_summary := app.cash_session_summary(p_session);
  update public.cash_sessions
  set status = 'closed',
      closed_at = now(),
      closed_by = app.current_user_id(),
      counted_cash = p_counted,
      count_detail = p_detail,
      expected_cash = (v_summary ->> 'expectedCash')::numeric,
      difference = p_counted - (v_summary ->> 'expectedCash')::numeric,
      counted_card = p_counted_card,
      expected_card = (v_summary ->> 'expectedCard')::numeric,
      card_difference = p_counted_card - (v_summary ->> 'expectedCard')::numeric,
      report = v_summary,
      notes = coalesce(p_notes, notes)
  where id = p_session
  returning * into v_s;
  return v_s;
end
$$;
revoke all on function app.close_cash_session(uuid, numeric, jsonb, text, numeric) from public;
grant execute on function app.close_cash_session(uuid, numeric, jsonb, text, numeric) to app_user;
