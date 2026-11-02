-- =====================================================================
-- Omnia · 0013 · Formato de compra (comprar en packs, vender por unidad)
--
-- El stock se lleva en la unidad en que se gasta o se vende (botella, l,
-- kg). Cada artículo puede tener además un formato de compra: «pack» de 24.
-- El albarán se registra como viene en el papel (4 packs a 3,10 €) y al
-- contabilizarlo entran 96 unidades a 0,129 €.
-- SQL portable (PostgreSQL 15+).
-- =====================================================================

alter table public.inventory_items
  add column purchase_unit      text check (purchase_unit is null or char_length(purchase_unit) between 1 and 20),
  add column purchase_pack_size numeric(18, 4) not null default 1 check (purchase_pack_size > 0);

-- Cada línea de albarán congela su conversión: cambiar el formato después
-- no altera albaranes ya registrados.
-- Las líneas existentes quedan a 1 sin reescribirlas (las contabilizadas son
-- inmutables); las nuevas toman el formato del artículo en el trigger.
alter table public.goods_receipt_lines
  add column pack_size numeric(18, 4) not null default 1 check (pack_size > 0);
alter table public.goods_receipt_lines alter column pack_size drop default;

create or replace function app.fill_receipt_pack_size() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.pack_size is null then
    select purchase_pack_size into new.pack_size
    from public.inventory_items
    where organization_id = new.organization_id and id = new.item_id;
    new.pack_size := coalesce(new.pack_size, 1);
  end if;
  return new;
end
$$;
create trigger goods_receipt_lines_pack_size before insert or update of item_id on public.goods_receipt_lines
  for each row execute function app.fill_receipt_pack_size();

-- La unidad de stock no se cambia a mano con existencias o historial: el libro
-- quedaría mezclando unidades. Para eso está app.convert_stock_unit().
create or replace function app.guard_item_unit() returns trigger
language plpgsql as $$
begin
  if new.unit_of_measure is distinct from old.unit_of_measure
     and current_setting('app.converting_unit', true) is distinct from 'on'
     and exists (select 1 from public.stock_movements where organization_id = old.organization_id and item_id = old.id) then
    raise exception 'El artículo ya tiene movimientos de stock: usa «Cambiar unidad de stock» para convertir las existencias'
      using errcode = 'OM002';
  end if;
  return new;
end
$$;
create trigger inventory_items_guard_unit before update of unit_of_measure on public.inventory_items
  for each row execute function app.guard_item_unit();

-- Pasa un artículo de comprarse y llevarse en «pack» a llevarse en unidades:
--   * existencias × factor (un ajuste por almacén, con nota) y coste ÷ factor;
--   * mínimos × factor y escandallos que lo usan × factor;
--   * la unidad antigua queda como formato de compra (pack de N).
-- El precio de venta no se toca: lo que se vendía por pack hay que revisarlo.
create or replace function app.convert_stock_unit(p_item uuid, p_new_unit text, p_factor numeric)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.inventory_items;
  v_level record;
begin
  select * into v_item from public.inventory_items where id = p_item for update;
  if not found or not (v_item.organization_id in (select app.authorized_org_ids('inventory.post'))) then
    raise exception 'Artículo no encontrado' using errcode = 'P0002';
  end if;
  if v_item.item_type <> 'stockable' then
    raise exception 'Solo los artículos inventariables llevan stock' using errcode = 'OM002';
  end if;
  if p_factor is null or p_factor <= 0 or p_factor = 1 then
    raise exception 'Indica cuántas unidades nuevas hay en cada %', v_item.unit_of_measure using errcode = 'OM002';
  end if;
  if p_new_unit is null or btrim(p_new_unit) = '' or btrim(p_new_unit) = v_item.unit_of_measure then
    raise exception 'Indica la nueva unidad de stock' using errcode = 'OM002';
  end if;

  for v_level in
    select warehouse_id, on_hand, avg_unit_cost from public.stock_levels
    where organization_id = v_item.organization_id and item_id = p_item
    order by warehouse_id
    for update
  loop
    if v_level.on_hand <> 0 then
      insert into public.stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, note, created_by)
      values (v_item.organization_id, v_level.warehouse_id, p_item, 'adjustment', v_level.on_hand * (p_factor - 1),
              format('Cambio de unidad: 1 %s = %s %s', v_item.unit_of_measure, trim_scale(p_factor), btrim(p_new_unit)),
              app.current_user_id());
    end if;
    update public.stock_levels
    set avg_unit_cost = round(v_level.avg_unit_cost / p_factor, 6),
        min_quantity = min_quantity * p_factor
    where organization_id = v_item.organization_id and warehouse_id = v_level.warehouse_id and item_id = p_item;
  end loop;

  update public.recipe_lines set quantity = quantity * p_factor
  where organization_id = v_item.organization_id and ingredient_id = p_item;

  perform set_config('app.converting_unit', 'on', true);
  update public.inventory_items
  set unit_of_measure = btrim(p_new_unit),
      purchase_unit = coalesce(v_item.purchase_unit, v_item.unit_of_measure),
      purchase_pack_size = p_factor * v_item.purchase_pack_size
  where id = p_item;
  perform set_config('app.converting_unit', 'off', true);
end
$$;
revoke all on function app.convert_stock_unit(uuid, text, numeric) from public;
grant execute on function app.convert_stock_unit(uuid, text, numeric) to app_user;
