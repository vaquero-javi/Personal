-- =====================================================================
-- Omnia · 0044 · Devoluciones de tickets en el TPV
--
-- Un encargado (pos.manage) devuelve un ticket entero desde «Tickets» del TPV:
--   * Se emite una rectificativa de factura simplificada (R5) con las líneas
--     del ticket en negativo, en la serie «TR» del año (se crea sola). Su total
--     negativo resta de la facturación (estadísticas, informes).
--   * El dinero que se devuelve queda como «cobro» de esa rectificativa en la
--     caja abierta del terminal, en efectivo o con tarjeta (importe en positivo,
--     igual que cualquier liquidación de una rectificativa).
--   * El reporte X/Z separa ventas y devoluciones, y lo devuelto se descuenta
--     del efectivo y de la tarjeta esperados.
-- Un ticket solo se devuelve una vez. El stock no se toca: lo servido ya salió.
-- =====================================================================

-- La devolución de un ticket tampoco lleva destinatario (como el ticket que rectifica).
alter table public.invoices drop constraint invoices_party_required;
alter table public.invoices add constraint invoices_party_required
  check (party_id is not null or invoice_type in ('F2', 'R5'));

-- Una sola devolución por ticket (también ante dos encargados a la vez).
create unique index invoices_one_pos_refund on public.invoices (organization_id, rectifies_invoice_id)
  where invoice_type = 'R5';

-- Serie de devoluciones del TPV del año en curso: «TR». Se crea si falta.
create or replace function app.pos_refund_series(p_org uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_year integer := extract(year from (now() at time zone 'Europe/Madrid'))::int;
  v_id   uuid;
begin
  if not (p_org in (select app.authorized_org_ids('pos.manage'))) then
    raise exception 'Solo un encargado puede hacer devoluciones' using errcode = '42501';
  end if;
  select id into v_id from public.invoice_series
  where organization_id = p_org and code = 'TR' and fiscal_year = v_year and invoice_kind = 'rectifying' and is_active;
  if v_id is null then
    insert into public.invoice_series (organization_id, code, description, invoice_kind, fiscal_year)
    values (p_org, 'TR', 'Devoluciones de tickets del TPV', 'rectifying', v_year)
    on conflict (organization_id, code, fiscal_year) do nothing
    returning id into v_id;
    if v_id is null then
      raise exception 'La serie TR de % existe pero no es de rectificativas o está desactivada: revísala en Facturación › Series', v_year
        using errcode = 'OM002';
    end if;
  end if;
  return v_id;
end
$$;
revoke all on function app.pos_refund_series(uuid) from public;
grant execute on function app.pos_refund_series(uuid) to app_user;

create or replace function app.issue_invoice(
  p_invoice_id uuid,
  p_series_id  uuid,
  p_issue_date date default current_date,
  p_pos_ticket boolean default false
) returns public.invoices
language plpgsql security definer
set search_path = ''
set timezone = 'Europe/Madrid'
as $$
declare
  v_inv       public.invoices;
  v_series    public.invoice_series;
  v_org       public.organizations;
  v_prev_hash text;
  v_subtotal  numeric(18, 2);
  v_tax       numeric(18, 2);
  v_withheld  numeric(18, 2);
  v_now       timestamptz := date_trunc('second', clock_timestamp());
  v_payload   text;
  v_outside   boolean;
  v_seq       bigint;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  -- SECURITY DEFINER no pasa por RLS: la autorización es explícita.
  if not found or not (v_inv.organization_id in (select app.authorized_org_ids('invoicing.issue'))) then
    raise exception 'Factura no encontrada' using errcode = 'P0002';
  end if;
  if v_inv.direction <> 'issued' or v_inv.status <> 'draft' then
    raise exception 'Solo se emiten borradores de facturas emitidas' using errcode = 'OM002';
  end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = v_inv.id) then
    raise exception 'La factura no tiene líneas' using errcode = 'OM002';
  end if;

  -- Bloqueo 1: la serie (numeración correlativa sin huecos).
  select * into v_series
  from public.invoice_series
  where id = p_series_id and organization_id = v_inv.organization_id and is_active
  for update;
  if not found then
    raise exception 'Serie de facturación no válida' using errcode = 'OM002';
  end if;
  if v_series.fiscal_year <> extract(year from p_issue_date) then
    raise exception 'La serie % es del ejercicio %', v_series.code, v_series.fiscal_year using errcode = 'OM002';
  end if;

  -- Bloqueo 2: el emisor (cadena de huellas única por NIF). NO KEY UPDATE no
  -- bloquea las comprobaciones de FK del resto de tablas que apuntan a la organización.
  select * into v_org from public.organizations where id = v_inv.organization_id for no key update;

  -- Fuera del sistema fiscal: sin régimen, o ticket del TPV con el ajuste
  -- «tickets sin VeriFactu». Esas facturas llevan su propia cadena de huellas,
  -- aparte de la que se envía: la cadena registrada no salta por un ticket.
  v_outside := v_org.fiscal_regime = 'none'
    or (p_pos_ticket and v_inv.invoice_type = 'F2'
        and not coalesce((v_org.settings ->> 'pos_tickets_verifactu')::boolean, true))
    -- La devolución de un ticket que iba fuera de VeriFactu va también fuera (0044).
    or (p_pos_ticket and v_inv.invoice_type = 'R5'
        and exists (select 1 from public.invoices o
                    where o.id = v_inv.rectifies_invoice_id and o.fiscal_status = 'not_applicable'));

  select i.fiscal_record_hash into v_prev_hash
  from public.invoices i
  where i.organization_id = v_inv.organization_id
    and i.direction = 'issued'
    and i.fiscal_record_hash is not null
    and (i.fiscal_status = 'not_applicable') = v_outside
  order by i.fiscal_chain_seq desc
  limit 1;
  -- Con el emisor bloqueado hasta el commit, quien emite después recibe un número mayor.
  v_seq := nextval('public.invoices_fiscal_chain_seq');

  select coalesce(sum(line_base), 0), coalesce(sum(line_tax), 0)
  into v_subtotal, v_tax
  from public.invoice_lines
  where invoice_id = v_inv.id;
  v_withheld := round(v_subtotal * v_inv.withholding_rate / 100, 2);

  v_inv.number := v_series.next_number;
  v_inv.full_number := v_series.code || '-' || v_series.fiscal_year || '-' || lpad(v_inv.number::text, 6, '0');
  update public.invoice_series set next_number = next_number + 1 where id = v_series.id;

  v_payload := concat_ws('&',
    'IDEmisorFactura=' || v_org.tax_id,
    'NumSerieFactura=' || v_inv.full_number,
    'FechaExpedicionFactura=' || to_char(p_issue_date, 'DD-MM-YYYY'),
    'TipoFactura=' || v_inv.invoice_type,
    'CuotaTotal=' || v_tax::text,
    'ImporteTotal=' || (v_subtotal + v_tax)::text,
    'Huella=' || coalesce(v_prev_hash, ''),
    'FechaHoraHusoGenRegistro=' || to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM')
  );

  update public.invoices
  set status               = 'issued',
      series_id            = v_series.id,
      number               = v_inv.number,
      full_number          = v_inv.full_number,
      issue_date           = p_issue_date,
      operation_date       = coalesce(operation_date, p_issue_date),
      subtotal             = v_subtotal,
      tax_total            = v_tax,
      withholding_total    = v_withheld,
      total                = v_subtotal + v_tax - v_withheld,
      fiscal_previous_hash = v_prev_hash,
      fiscal_record_hash   = upper(encode(sha256(convert_to(v_payload, 'UTF8')), 'hex')),
      fiscal_record_at     = v_now,
      fiscal_chain_seq     = v_seq,
      fiscal_status        = case when v_outside then 'not_applicable' else 'pending' end,
      issuer_snapshot      = app.issuer_snapshot(v_org),
      party_snapshot       = (select app.party_snapshot(p) from public.parties p where p.id = v_inv.party_id)
  where id = v_inv.id
  returning * into v_inv;

  return v_inv;
end
$$;


-- Reporte X/Z: las devoluciones aparte y descontadas de lo esperado.
create or replace function app.cash_session_summary(p_session uuid) returns jsonb
language sql stable as $$
  with s as (
    select * from public.cash_sessions where id = p_session
  ),
  pays as (
    select p.invoice_id, p.method, p.amount, i.total < 0 as is_refund
    from public.invoice_payments p
    join public.invoices i on i.id = p.invoice_id
    cross join s
    where p.organization_id = s.organization_id and p.cash_session_id = s.id
  ),
  inv as (
    select i.id, i.full_number, i.fiscal_record_at, i.number from public.invoices i
    where i.id in (select invoice_id from pays where not is_refund)
  ),
  ref as (
    select i.id, i.full_number, i.fiscal_record_at, i.total, o.full_number as original_number,
           (select method from pays where pays.invoice_id = i.id limit 1) as method
    from public.invoices i
    left join public.invoices o on o.id = i.rectifies_invoice_id
    where i.id in (select invoice_id from pays where is_refund)
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
    from pays where not is_refund
  ),
  refunds as (
    select
      coalesce(sum(amount) filter (where method = 'cash'), 0) as cash,
      coalesce(sum(amount) filter (where method = 'card'), 0) as card,
      coalesce(sum(amount), 0) as total,
      count(distinct invoice_id) as n
    from pays where is_refund
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
    -- Ventas por forma de pago ya corregidas con los traspasos (sin restar devoluciones).
    'cashSales', totals.cash - moves.cash_to_card + moves.card_to_cash,
    'cardSales', totals.card + moves.cash_to_card - moves.card_to_cash,
    -- Tal como se marcaron al cobrar en el TPV.
    'cashRecorded', totals.cash,
    'cardRecorded', totals.card,
    'cashToCard', moves.cash_to_card,
    'cardToCash', moves.card_to_cash,
    'totalSales', totals.total,
    'tickets', totals.tickets,
    -- Devoluciones: lo devuelto en efectivo sale del cajón; con tarjeta, del datáfono.
    'refunds', refunds.n,
    'refundsCash', refunds.cash,
    'refundsCard', refunds.card,
    'refundsTotal', refunds.total,
    'netSales', totals.total - refunds.total,
    'refundList', coalesce((
      select jsonb_agg(jsonb_build_object('number', full_number, 'originalNumber', original_number, 'amount', -total,
                                          'method', method, 'at', fiscal_record_at) order by fiscal_record_at)
      from ref
    ), '[]'::jsonb),
    'deposits', moves.deposits,
    'withdrawals', moves.withdrawals,
    'expectedCash', s.opening_float + totals.cash - moves.cash_to_card + moves.card_to_cash + moves.deposits - moves.withdrawals - refunds.cash,
    'expectedCard', totals.card + moves.cash_to_card - moves.card_to_cash - refunds.card,
    'averageTicket', case when totals.tickets > 0 then round(totals.total / totals.tickets, 2) else 0 end,
    'firstTicket', (select full_number from inv order by fiscal_record_at, number limit 1),
    'lastTicket', (select full_number from inv order by fiscal_record_at desc, number desc limit 1),
    -- Impuestos netos: las devoluciones restan su base y su cuota.
    'taxes', coalesce((
      select jsonb_agg(jsonb_build_object('rate', rate, 'base', base, 'tax', tax) order by rate)
      from (
        select l.tax_rate as rate, sum(l.line_base) as base, sum(l.line_tax) as tax
        from public.invoice_lines l
        where l.invoice_id in (select id from inv) or l.invoice_id in (select id from ref)
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
  from s, totals, refunds, moves
$$;
