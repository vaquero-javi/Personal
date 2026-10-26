-- Documento A4 de la factura. Una factura emitida debe mostrar los datos del
-- emisor y del destinatario tal como eran al expedirla: se congelan en la
-- propia factura al emitir, y el PDF se genera siempre a partir de esa foto
-- (cambiar luego la dirección de un cliente no altera facturas ya emitidas).

alter table public.organizations
  add column fiscal_address jsonb not null default '{}' check (jsonb_typeof(fiscal_address) = 'object'),
  add column iban           text check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$');

alter table public.invoices
  add column issuer_snapshot jsonb,
  add column party_snapshot  jsonb;

create or replace function app.issuer_snapshot(o public.organizations) returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'legalName', o.legal_name, 'tradeName', o.trade_name, 'taxId', o.tax_id,
    'address', o.fiscal_address, 'iban', o.iban))
$$;

create or replace function app.party_snapshot(p public.parties) returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'legalName', p.legal_name, 'taxId', p.tax_id, 'address', p.billing_address))
$$;

-- Facturas ya emitidas antes de esta migración: se congelan con los datos actuales.
alter table public.invoices disable trigger invoices_guard;
update public.invoices i
set issuer_snapshot = app.issuer_snapshot(o),
    party_snapshot  = (select app.party_snapshot(p) from public.parties p where p.id = i.party_id)
from public.organizations o
where o.id = i.organization_id and i.direction = 'issued' and i.status <> 'draft';
alter table public.invoices enable trigger invoices_guard;

-- Igual que en 0008, más la foto de emisor y destinatario.
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
  v_withheld  numeric(18, 2);
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
      fiscal_status        = case when v_org.fiscal_regime = 'none' then 'not_applicable' else 'pending' end,
      issuer_snapshot      = app.issuer_snapshot(v_org),
      party_snapshot       = (select app.party_snapshot(p) from public.parties p where p.id = v_inv.party_id)
  where id = v_inv.id
  returning * into v_inv;

  return v_inv;
end
$$;
