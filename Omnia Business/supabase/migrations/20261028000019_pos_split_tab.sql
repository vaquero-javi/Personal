-- =====================================================================
-- Omnia · 0019 · Dividir la cuenta
--
-- Para cobrar solo una parte de una cuenta, las unidades elegidas pasan a una
-- cuenta nueva que se cobra en la misma transacción; la original sigue abierta
-- con el resto. La cuenta nueva no lleva mesa (una mesa tiene una sola cuenta
-- abierta): su etiqueta es el nombre de la mesa, y así sale en el ticket.
--
-- Pasar unidades de una cuenta a otra no cambia lo consumido, así que cualquier
-- camarero puede hacerlo aunque ya estén en cocina o lleven descuento. Por eso
-- se hace aquí, como DEFINER, y la guarda de líneas lo deja pasar solo desde
-- esta función (app_user no puede hacerse pasar por el propietario).
-- =====================================================================

create or replace function app.guard_pos_tab_line() returns trigger
language plpgsql as $$
declare
  v_org    uuid;
  v_tab    uuid;
  v_status text;
  v_manage boolean;
begin
  -- Dentro de app.pos_split_tab: ya ha validado cuentas y cantidades.
  if current_user <> 'app_user' and current_setting('app.pos_splitting', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    v_org := old.organization_id; v_tab := old.tab_id;
  else
    v_org := new.organization_id; v_tab := new.tab_id;
  end if;
  select status into v_status from public.pos_tabs where organization_id = v_org and id = v_tab;
  if v_status is distinct from 'open' then
    raise exception 'La cuenta no admite cambios en estado %', coalesce(v_status, 'desconocido') using errcode = 'OM001';
  end if;
  v_manage := app.has_permission(v_org, 'pos.manage');

  if tg_op = 'INSERT' then
    if new.discount_pct <> 0 and not v_manage then
      raise exception 'Los descuentos los aplica un encargado' using errcode = 'OM002';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (new.item_id, new.unit_price, new.tax_rate, new.tab_id, new.added_by)
       is distinct from (old.item_id, old.unit_price, old.tax_rate, old.tab_id, old.added_by) then
      raise exception 'El artículo y el precio de una línea no se modifican: quítala y añádela de nuevo' using errcode = 'OM001';
    end if;
    if new.discount_pct <> old.discount_pct and not v_manage then
      raise exception 'Los descuentos los aplica un encargado' using errcode = 'OM002';
    end if;
    if old.sent_at is not null and new.quantity < old.quantity and not v_manage then
      raise exception 'Quitar algo ya enviado a cocina requiere a un encargado' using errcode = 'OM002';
    end if;
    return new;
  end if;

  if old.sent_at is not null and not v_manage then
    raise exception 'Quitar algo ya enviado a cocina requiere a un encargado' using errcode = 'OM002';
  end if;
  return old;
end
$$;

-- Pasa a la cuenta p_new_tab las unidades indicadas ([{"lineId": …, "quantity": n}]).
-- p_new_tab lo genera el terminal: si ya existe, es un reintento y no se repite.
create or replace function app.pos_split_tab(p_tab uuid, p_new_tab uuid, p_items jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tab   public.pos_tabs;
  v_label text;
  v_item  record;
  v_line  public.pos_tab_lines;
  v_moved integer := 0;
begin
  if exists (select 1 from public.pos_tabs where id = p_new_tab) then
    return p_new_tab;
  end if;

  select * into v_tab from public.pos_tabs where id = p_tab for update;
  if not found or v_tab.organization_id not in (select app.authorized_org_ids('pos.use')) then
    raise exception 'Cuenta no encontrada' using errcode = 'OM002';
  end if;
  if v_tab.status not in ('open', 'billing') then
    raise exception 'La cuenta ya está cerrada' using errcode = 'OM001';
  end if;

  select left(coalesce(t.name, v_tab.label, 'Cuenta ' || v_tab.number), 40) into v_label
  from (select 1) x left join public.pos_tables t on t.id = v_tab.table_id;

  insert into public.pos_tabs (id, organization_id, label, terminal_id, waiter_id, guests)
  values (p_new_tab, v_tab.organization_id, v_label, v_tab.terminal_id, v_tab.waiter_id, 1);

  perform set_config('app.pos_splitting', 'on', true);
  for v_item in
    select (e ->> 'lineId')::uuid as line_id, (e ->> 'quantity')::numeric as quantity
    from jsonb_array_elements(p_items) e
  loop
    select * into v_line from public.pos_tab_lines
    where id = v_item.line_id and tab_id = p_tab for update;
    if not found then
      raise exception 'Una de las líneas ya no está en la cuenta' using errcode = 'OM002';
    end if;
    if v_item.quantity is null or v_item.quantity <= 0 or v_item.quantity > v_line.quantity then
      raise exception 'Cantidad no válida para «%»', v_line.description using errcode = 'OM002';
    end if;

    if v_item.quantity = v_line.quantity then
      update public.pos_tab_lines set tab_id = p_new_tab where id = v_line.id;
    else
      update public.pos_tab_lines set quantity = quantity - v_item.quantity where id = v_line.id;
      insert into public.pos_tab_lines (id, organization_id, tab_id, item_id, description, quantity, unit_price,
                                        tax_rate, discount_pct, note, sent_at, added_by, created_at)
      values (gen_random_uuid(), v_line.organization_id, p_new_tab, v_line.item_id, v_line.description, v_item.quantity,
              v_line.unit_price, v_line.tax_rate, v_line.discount_pct, v_line.note, v_line.sent_at, v_line.added_by, v_line.created_at);
    end if;
    v_moved := v_moved + 1;
  end loop;
  perform set_config('app.pos_splitting', 'off', true);

  if v_moved = 0 then
    raise exception 'Elige al menos un producto para cobrar aparte' using errcode = 'OM002';
  end if;
  return p_new_tab;
end
$$;

revoke all on function app.pos_split_tab(uuid, uuid, jsonb) from public;
grant execute on function app.pos_split_tab(uuid, uuid, jsonb) to app_user;
