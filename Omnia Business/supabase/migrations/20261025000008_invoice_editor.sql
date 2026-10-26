-- Apartado de creación de facturas: retención de IRPF, observaciones y forma
-- de pago prevista. La retención no forma parte del registro VeriFactu
-- (ImporteTotal = base + cuotas), pero sí del importe a cobrar (`total`).

alter table public.invoices
  add column notes             text check (char_length(notes) <= 2000),
  add column payment_method    text check (payment_method in ('transfer', 'card', 'cash', 'direct_debit', 'other')),
  add column withholding_rate  numeric(5, 2) not null default 0 check (withholding_rate between 0 and 50),
  add column withholding_total numeric(18, 2) not null default 0;

-- Igual que en 0003, más la retención al totalizar.
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
      fiscal_status        = case when v_org.fiscal_regime = 'none' then 'not_applicable' else 'pending' end
  where id = v_inv.id
  returning * into v_inv;

  return v_inv;
end
$$;
