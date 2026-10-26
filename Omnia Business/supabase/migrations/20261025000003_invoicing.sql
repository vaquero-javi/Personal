-- =====================================================================
-- Omnia · 0003 · Facturación (emitidas y recibidas), cobros y pagos
--
-- Requisitos fiscales que se garantizan en BD:
--   * Numeración correlativa sin huecos por serie y ejercicio.
--   * Inmutabilidad de la factura emitida (se corrige con rectificativa).
--   * Encadenamiento de huellas SHA-256 por emisor (VeriFactu, RD 1007/2023).
-- El envío a la AEAT / haciendas forales (y la firma XAdES de TicketBAI) lo hace
-- un worker que consume las facturas con fiscal_status = 'pending'.
-- =====================================================================

create table public.invoice_series (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  code            text not null check (code ~ '^[A-Z0-9]{1,10}$'),
  description     text,
  invoice_kind    text not null default 'standard' check (invoice_kind in ('standard', 'simplified', 'rectifying')),
  fiscal_year     integer not null check (fiscal_year between 2000 and 2100),
  next_number     integer not null default 1 check (next_number > 0),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, code, fiscal_year),
  unique (organization_id, id)
);

create table public.invoices (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  direction            text not null check (direction in ('issued', 'received')),
  status               text not null default 'draft'
                       check (status in ('draft', 'issued', 'partially_paid', 'paid', 'cancelled')),
  series_id            uuid,
  number               integer,
  full_number          text,            -- emitidas: "A-2026-000123"; recibidas: nº del proveedor
  invoice_type         text not null default 'F1'
                       check (invoice_type in ('F1', 'F2', 'F3', 'R1', 'R2', 'R3', 'R4', 'R5')),
  party_id             uuid not null,
  rectifies_invoice_id uuid,
  issue_date           date,
  operation_date       date,
  due_date             date,
  currency             char(3) not null default 'EUR',
  subtotal             numeric(18, 2) not null default 0,
  tax_total            numeric(18, 2) not null default 0,
  total                numeric(18, 2) not null default 0,
  paid_total           numeric(18, 2) not null default 0 check (paid_total >= 0),
  -- Registro fiscal
  fiscal_previous_hash char(64),
  fiscal_record_hash   char(64),
  fiscal_record_at     timestamptz,
  fiscal_status        text not null default 'not_applicable'
                       check (fiscal_status in ('not_applicable', 'pending', 'sent', 'accepted',
                                                'accepted_with_errors', 'rejected')),
  fiscal_response      jsonb,
  custom_fields        jsonb not null default '{}' check (jsonb_typeof(custom_fields) = 'object'),
  created_by           uuid references public.users (id) default app.current_user_id(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organization_id, id),
  unique (series_id, number),
  foreign key (organization_id, series_id) references public.invoice_series (organization_id, id),
  foreign key (organization_id, party_id) references public.parties (organization_id, id),
  foreign key (organization_id, rectifies_invoice_id) references public.invoices (organization_id, id),
  -- Una emitida que sale de borrador lleva serie, número, fecha y huella.
  check (direction = 'received' or status = 'draft'
         or (series_id is not null and number is not null and issue_date is not null and fiscal_record_hash is not null)),
  check (direction = 'issued' or (full_number is not null and issue_date is not null)),
  check (invoice_type not like 'R%' or rectifies_invoice_id is not null)
);
create unique index invoices_received_key on public.invoices (organization_id, party_id, full_number)
  where direction = 'received';
create index invoices_list_idx on public.invoices (organization_id, direction, issue_date desc);
create index invoices_fiscal_chain_idx on public.invoices (organization_id, fiscal_record_at desc)
  where direction = 'issued' and fiscal_record_hash is not null;
create index invoices_fiscal_pending_idx on public.invoices (fiscal_status) where fiscal_status = 'pending';

create table public.invoice_lines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id      uuid not null,
  line_no         integer not null check (line_no > 0),
  item_id         uuid,
  description     text not null,
  quantity        numeric(18, 4) not null check (quantity <> 0),
  unit_price      numeric(18, 4) not null,
  discount_pct    numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  tax_type        text not null default 'IVA' check (tax_type in ('IVA', 'IGIC', 'IPSI', 'EXENTO')),
  tax_rate        numeric(5, 2) not null check (tax_rate >= 0),
  -- Redondeo por línea; los totales de la factura son la suma de líneas.
  line_base       numeric(18, 2) generated always as
                  (round(quantity * unit_price * (1 - discount_pct / 100), 2)) stored,
  line_tax        numeric(18, 2) generated always as
                  (round(round(quantity * unit_price * (1 - discount_pct / 100), 2) * tax_rate / 100, 2)) stored,
  unique (invoice_id, line_no),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete cascade,
  foreign key (organization_id, item_id) references public.inventory_items (organization_id, id),
  check (tax_type <> 'EXENTO' or tax_rate = 0)
);

-- Cobros (emitidas) y pagos (recibidas). Append-only: una devolución es otro registro.
create table public.invoice_payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id      uuid not null,
  amount          numeric(18, 2) not null check (amount > 0),
  paid_at         date not null default current_date,
  method          text not null check (method in ('transfer', 'card', 'cash', 'direct_debit', 'other')),
  reference       text,
  created_by      uuid references public.users (id) default app.current_user_id(),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id)
);
create index invoice_payments_invoice_idx on public.invoice_payments (organization_id, invoice_id);

-- ---------------------------------------------------------------------
-- Inmutabilidad
-- ---------------------------------------------------------------------

create or replace function app.guard_invoice() returns trigger
language plpgsql as $$
declare
  -- Lo único que puede cambiar en una factura ya emitida.
  v_mutable constant text[] := array['status', 'paid_total', 'fiscal_status', 'fiscal_response', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Una factura emitida no se borra: emite una rectificativa' using errcode = 'OM001';
    end if;
    return old;
  end if;

  if old.status <> 'draft' then
    if new.status = 'draft' then
      raise exception 'Una factura emitida no vuelve a borrador' using errcode = 'OM001';
    end if;
    if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
      raise exception 'La factura % está emitida y sus datos son inmutables', old.full_number using errcode = 'OM001';
    end if;
  end if;
  return new;
end
$$;

create or replace function app.guard_invoice_line() returns trigger
language plpgsql as $$
declare
  v_status text;
begin
  select status into v_status
  from public.invoices
  where organization_id = coalesce(new.organization_id, old.organization_id)
    and id = coalesce(new.invoice_id, old.invoice_id);
  if v_status is not null and v_status <> 'draft' then
    raise exception 'No se pueden modificar líneas de una factura emitida' using errcode = 'OM001';
  end if;
  return coalesce(new, old);
end
$$;

create trigger invoices_guard before update or delete on public.invoices
  for each row execute function app.guard_invoice();
create trigger invoices_touch before update on public.invoices
  for each row execute function app.touch_updated_at();
create trigger invoices_audit after insert or update or delete on public.invoices
  for each row execute function app.audit_row();
create trigger invoice_lines_guard before insert or update or delete on public.invoice_lines
  for each row execute function app.guard_invoice_line();
create trigger invoice_payments_immutable before update or delete on public.invoice_payments
  for each row execute function app.forbid_mutation();
create trigger invoice_payments_audit after insert on public.invoice_payments
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------
-- Cobros: actualiza paid_total/status bajo bloqueo de la factura
-- ---------------------------------------------------------------------

create or replace function app.apply_invoice_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invoices;
begin
  select * into v_inv
  from public.invoices
  where organization_id = new.organization_id and id = new.invoice_id
  for update;

  if v_inv.status not in ('issued', 'partially_paid') then
    raise exception 'La factura no admite cobros en estado %', v_inv.status using errcode = 'OM002';
  end if;
  if v_inv.paid_total + new.amount > abs(v_inv.total) then
    raise exception 'El importe supera el pendiente (%)', abs(v_inv.total) - v_inv.paid_total using errcode = 'OM002';
  end if;

  update public.invoices
  set paid_total = paid_total + new.amount,
      status = case when paid_total + new.amount = abs(total) then 'paid' else 'partially_paid' end
  where id = v_inv.id;
  return null;
end
$$;

create trigger invoice_payments_apply after insert on public.invoice_payments
  for each row execute function app.apply_invoice_payment();

-- ---------------------------------------------------------------------
-- Emisión: numeración + totales + huella encadenada, todo en una transacción
-- ---------------------------------------------------------------------

-- La huella sigue el formato de registro de alta de VeriFactu
-- (campos "clave=valor" unidos por '&', SHA-256 en hexadecimal mayúsculas).
-- ⚠ Antes de producción, validar contra la especificación técnica vigente de la AEAT.
create or replace function app.issue_invoice(
  p_invoice_id uuid,
  p_series_id  uuid,
  p_issue_date date default current_date
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
  v_now       timestamptz := date_trunc('second', clock_timestamp());
  v_payload   text;
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

  select i.fiscal_record_hash into v_prev_hash
  from public.invoices i
  where i.organization_id = v_inv.organization_id
    and i.direction = 'issued'
    and i.fiscal_record_hash is not null
  order by i.fiscal_record_at desc, i.id desc
  limit 1;

  select coalesce(sum(line_base), 0), coalesce(sum(line_tax), 0)
  into v_subtotal, v_tax
  from public.invoice_lines
  where invoice_id = v_inv.id;

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
      total                = v_subtotal + v_tax,
      fiscal_previous_hash = v_prev_hash,
      fiscal_record_hash   = upper(encode(sha256(convert_to(v_payload, 'UTF8')), 'hex')),
      fiscal_record_at     = v_now,
      fiscal_status        = case when v_org.fiscal_regime = 'none' then 'not_applicable' else 'pending' end
  where id = v_inv.id
  returning * into v_inv;

  return v_inv;
end
$$;
revoke all on function app.issue_invoice(uuid, uuid, date) from public;
grant execute on function app.issue_invoice(uuid, uuid, date) to app_user;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

select app.apply_tenant_policies('public.invoice_series', 'invoicing');
select app.apply_tenant_policies('public.invoices', 'invoicing');
select app.apply_tenant_policies('public.invoice_lines', 'invoicing');
select app.apply_tenant_policies('public.invoice_payments', 'invoicing', p_append_only => true);

-- Por UPDATE directo una factura solo puede quedar en borrador o anulada;
-- la emisión pasa obligatoriamente por app.issue_invoice().
create policy invoices_status_via_functions on public.invoices as restrictive for update to app_user
  using (true)
  with check (status in ('draft', 'cancelled'));
