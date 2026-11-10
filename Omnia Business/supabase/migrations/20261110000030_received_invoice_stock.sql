-- =====================================================================
-- Omnia · 0030 · El stock de compras entra con la factura recibida
--
-- Hasta ahora la mercancía entraba al contabilizar el albarán. A partir de
-- aquí entra al registrar la factura del proveedor: cada línea con un
-- artículo inventariable suma su cantidad en el almacén de la factura y
-- recalcula el coste medio con el precio neto de la línea. El albarán queda
-- como justificante (y para marcar lo recibido de un pedido): ya no mueve
-- stock; eso lo decide la aplicación, aquí no se toca.
--
-- - invoices.warehouse_id: almacén en el que entra (solo facturas recibidas).
-- - invoice_lines.pack_size: igual que en los albaranes, la línea puede venir
--   en el formato de compra del artículo (2 cajas de 24 → 48 ud) o en su
--   unidad de stock (pack_size = 1). Cualquier otro factor se rechaza.
-- - Se registra en la misma transacción (SECURITY DEFINER): quien puede
--   registrar facturas no necesita permisos de almacén, y no queda una factura
--   sin su entrada ni una entrada sin factura.
-- - Las facturas ya registradas no se tocan: su stock entró con los albaranes.
-- =====================================================================

alter table public.invoices
  add column warehouse_id uuid,
  add foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id),
  add constraint invoices_warehouse_received check (warehouse_id is null or direction = 'received');

alter table public.invoice_lines
  add column pack_size numeric(18, 4) check (pack_size > 0);

-- Formato de la línea de una factura recibida: sin indicarlo, el de compra
-- del artículo; si se indica, 1 (unidades) o el de compra.
create or replace function app.fill_invoice_line_pack_size() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_direction text;
  v_pack      numeric;
begin
  if new.item_id is null then
    new.pack_size := null;
    return new;
  end if;
  select direction into v_direction from public.invoices where id = new.invoice_id;
  if v_direction is distinct from 'received' then
    new.pack_size := null;
    return new;
  end if;
  select coalesce(purchase_pack_size, 1) into v_pack
  from public.inventory_items
  where organization_id = new.organization_id and id = new.item_id;
  if new.pack_size is null then
    new.pack_size := coalesce(v_pack, 1);
  elsif new.pack_size <> 1 and new.pack_size <> v_pack then
    raise exception 'La conversión de la línea (%) no coincide con el formato de compra del artículo (%)', trim_scale(new.pack_size), trim_scale(v_pack)
      using errcode = 'OM002';
  end if;
  return new;
end
$$;
create trigger invoice_lines_pack_size before insert or update of item_id, pack_size on public.invoice_lines
  for each row execute function app.fill_invoice_line_pack_size();

-- Igual que antes (cierra la factura con sus totales) y, además, da entrada al
-- stock de sus líneas inventariables. Las líneas en negativo (abonos) no
-- mueven stock.
create or replace function app.register_received_invoice(p_invoice_id uuid) returns public.invoices
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invoices;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found or v_inv.organization_id not in (select app.authorized_org_ids('invoicing.write')) then
    raise exception 'Factura no encontrada' using errcode = 'P0002';
  end if;
  if v_inv.direction <> 'received' or v_inv.status <> 'draft' then
    raise exception 'Solo se registran borradores de facturas recibidas' using errcode = 'OM002';
  end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = v_inv.id) then
    raise exception 'La factura no tiene líneas' using errcode = 'OM002';
  end if;

  if exists (
       select 1 from public.invoice_lines l join public.inventory_items i on i.id = l.item_id
       where l.invoice_id = v_inv.id and i.item_type = 'stockable' and l.quantity > 0
     ) then
    if v_inv.warehouse_id is null then
      raise exception 'Indica en qué almacén entra la mercancía de la factura' using errcode = 'OM002';
    end if;
    -- Ordenado por artículo: mismo orden de bloqueo de saldos que albaranes y ventas.
    insert into public.stock_movements
      (organization_id, warehouse_id, item_id, movement_type, quantity, unit_cost, source_type, source_id, source_line_id, note)
    select l.organization_id, v_inv.warehouse_id, l.item_id, 'receipt',
           (l.quantity * coalesce(l.pack_size, 1))::numeric(18, 4),
           round(l.unit_price * (1 - l.discount_pct / 100) / coalesce(l.pack_size, 1), 6),
           'invoice', v_inv.id, l.id,
           left('Factura ' || v_inv.full_number, 200)
    from public.invoice_lines l join public.inventory_items i on i.id = l.item_id
    where l.invoice_id = v_inv.id and i.item_type = 'stockable' and l.quantity > 0
    order by l.item_id, l.line_no;
  end if;

  update public.invoices i
  set status = 'issued',
      subtotal = t.base,
      tax_total = t.tax,
      total = t.base + t.tax,
      fiscal_status = 'not_applicable'
  from (
    select coalesce(sum(line_base), 0) as base, coalesce(sum(line_tax), 0) as tax
    from public.invoice_lines where invoice_id = p_invoice_id
  ) t
  where i.id = p_invoice_id
  returning i.* into v_inv;
  return v_inv;
end
$$;
