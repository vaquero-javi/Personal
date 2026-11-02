-- =====================================================================
-- Omnia · 0016 · Tickets del TPV con o sin VeriFactu
--
-- Ajuste por sociedad (settings.pos_tickets_verifactu, por defecto sí): con
-- él apagado, los tickets que cobra el TPV se emiten como factura
-- simplificada sin registro VeriFactu (ni QR ni envío a la AEAT). Las
-- facturas del backoffice siguen el régimen fiscal de la sociedad.
--
-- issue_invoice gana un cuarto parámetro con valor por defecto; la versión de
-- tres se elimina para que las llamadas existentes no sean ambiguas.
-- =====================================================================

drop function app.issue_invoice(uuid, uuid, date);

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
        and not coalesce((v_org.settings ->> 'pos_tickets_verifactu')::boolean, true));

  select i.fiscal_record_hash into v_prev_hash
  from public.invoices i
  where i.organization_id = v_inv.organization_id
    and i.direction = 'issued'
    and i.fiscal_record_hash is not null
    and (i.fiscal_status = 'not_applicable') = v_outside
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
      fiscal_status        = case when v_outside then 'not_applicable' else 'pending' end,
      issuer_snapshot      = app.issuer_snapshot(v_org),
      party_snapshot       = (select app.party_snapshot(p) from public.parties p where p.id = v_inv.party_id)
  where id = v_inv.id
  returning * into v_inv;

  return v_inv;
end
$$;

revoke all on function app.issue_invoice(uuid, uuid, date, boolean) from public;
grant execute on function app.issue_invoice(uuid, uuid, date, boolean) to app_user;
