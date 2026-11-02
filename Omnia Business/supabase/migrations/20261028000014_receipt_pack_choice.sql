-- =====================================================================
-- Omnia · 0014 · Albarán en cajas o en unidades, a elegir por línea
--
-- Cada línea dice en qué viene la cantidad: en el formato de compra del
-- artículo (3 cajas → 72 ud) o en su unidad de stock (5 ud sueltas). Sin
-- indicarlo, se toma el formato de compra. Cualquier otro factor se rechaza:
-- el stock no puede entrar con una conversión inventada.
-- =====================================================================

create or replace function app.fill_receipt_pack_size() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pack numeric;
begin
  select purchase_pack_size into v_pack
  from public.inventory_items
  where organization_id = new.organization_id and id = new.item_id;
  v_pack := coalesce(v_pack, 1);
  if new.pack_size is null then
    new.pack_size := v_pack;
  elsif new.pack_size <> 1 and new.pack_size <> v_pack then
    raise exception 'La conversión de la línea (%) no coincide con el formato de compra del artículo (%)', trim_scale(new.pack_size), trim_scale(v_pack)
      using errcode = 'OM002';
  end if;
  return new;
end
$$;

drop trigger goods_receipt_lines_pack_size on public.goods_receipt_lines;
create trigger goods_receipt_lines_pack_size before insert or update of item_id, pack_size on public.goods_receipt_lines
  for each row execute function app.fill_receipt_pack_size();
