-- =====================================================================
-- Omnia · 0002 · Terceros, catálogo multitarifa y almacén (WMS básico)
--
-- Integridad entre tenants: toda tabla hija referencia a su padre por la
-- pareja (organization_id, id). Así es imposible, incluso para un rol que
-- se salte RLS, enlazar un albarán de la empresa A con un artículo de B.
--
-- Stock: libro mayor inmutable (stock_movements) + saldo derivado
-- (stock_levels) que solo actualiza el trigger del libro, en la misma
-- transacción. La CHECK on_hand >= 0 aborta cualquier salida sin existencias.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tarifas y terceros (clientes / proveedores)
-- ---------------------------------------------------------------------

create table public.price_lists (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  code            text not null,
  name            text not null,
  currency        char(3) not null default 'EUR',
  prices_include_tax boolean not null default false,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);
create unique index price_lists_one_default on public.price_lists (organization_id) where is_default;

create table public.parties (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  is_customer     boolean not null default false,
  is_supplier     boolean not null default false,
  legal_name      text not null,
  tax_id          text,
  email           text,
  phone           text,
  billing_address jsonb not null default '{}' check (jsonb_typeof(billing_address) = 'object'),
  price_list_id   uuid,
  payment_terms_days integer not null default 0 check (payment_terms_days between 0 and 365),
  custom_fields   jsonb not null default '{}' check (jsonb_typeof(custom_fields) = 'object'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, price_list_id) references public.price_lists (organization_id, id),
  check (is_customer or is_supplier)
);
create unique index parties_tax_id_key on public.parties (organization_id, tax_id) where tax_id is not null;
create index parties_name_idx on public.parties (organization_id, legal_name);
create index parties_custom_fields_idx on public.parties using gin (custom_fields jsonb_path_ops);

-- ---------------------------------------------------------------------
-- Almacenes y artículos
-- ---------------------------------------------------------------------

create table public.warehouses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  code            text not null,
  name            text not null,
  address         jsonb not null default '{}' check (jsonb_typeof(address) = 'object'),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);

create table public.inventory_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  sku              text not null,
  barcode          text,
  name             text not null,
  item_type        text not null default 'stockable' check (item_type in ('stockable', 'consumable', 'service')),
  unit_of_measure  text not null default 'unit',
  default_tax_rate numeric(5, 2) not null default 21.00 check (default_tax_rate >= 0),
  is_active        boolean not null default true,
  custom_fields    jsonb not null default '{}' check (jsonb_typeof(custom_fields) = 'object'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, sku),
  unique (organization_id, id)
);
create unique index inventory_items_barcode_key on public.inventory_items (organization_id, barcode) where barcode is not null;
create index inventory_items_custom_fields_idx on public.inventory_items using gin (custom_fields jsonb_path_ops);

create table public.price_list_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  price_list_id   uuid not null,
  item_id         uuid not null,
  min_quantity    numeric(18, 4) not null default 1 check (min_quantity > 0),  -- escalado por volumen
  unit_price      numeric(18, 4) not null check (unit_price >= 0),
  valid_from      date not null default current_date,
  valid_to        date,
  foreign key (organization_id, price_list_id) references public.price_lists (organization_id, id) on delete cascade,
  foreign key (organization_id, item_id) references public.inventory_items (organization_id, id) on delete cascade,
  unique (price_list_id, item_id, min_quantity, valid_from),
  check (valid_to is null or valid_to >= valid_from)
);

-- ---------------------------------------------------------------------
-- Saldo de stock por almacén (derivado; no se escribe a mano)
-- ---------------------------------------------------------------------

create table public.stock_levels (
  organization_id uuid not null,
  warehouse_id    uuid not null,
  item_id         uuid not null,
  on_hand         numeric(18, 4) not null default 0,
  reserved        numeric(18, 4) not null default 0,
  min_quantity    numeric(18, 4) not null default 0,     -- umbral de alerta de stock mínimo
  avg_unit_cost   numeric(18, 6) not null default 0,     -- coste medio ponderado
  updated_at      timestamptz not null default now(),
  primary key (organization_id, warehouse_id, item_id),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id),
  foreign key (organization_id, item_id) references public.inventory_items (organization_id, id),
  constraint stock_levels_on_hand_non_negative check (on_hand >= 0),
  constraint stock_levels_reserved_valid check (reserved >= 0 and reserved <= on_hand),
  check (min_quantity >= 0)
);
-- Alimenta la bandeja de alertas de stock mínimo.
create index stock_levels_below_min_idx on public.stock_levels (organization_id, warehouse_id)
  where on_hand <= min_quantity;

-- ---------------------------------------------------------------------
-- Libro de movimientos (append-only)
-- ---------------------------------------------------------------------

create table public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  warehouse_id    uuid not null,
  item_id         uuid not null,
  movement_type   text not null check (movement_type in ('receipt', 'issue', 'sale', 'return',
                                                         'adjustment', 'transfer_in', 'transfer_out')),
  quantity        numeric(18, 4) not null check (quantity <> 0),   -- con signo: + entra, − sale
  unit_cost       numeric(18, 6) check (unit_cost >= 0),
  source_type     text check (source_type in ('goods_receipt', 'invoice', 'sale', 'adjustment', 'transfer')),
  source_id       uuid,
  source_line_id  uuid,
  note            text,
  occurred_at     timestamptz not null default now(),
  created_by      uuid references public.users (id) default app.current_user_id(),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id),
  foreign key (organization_id, item_id) references public.inventory_items (organization_id, id),
  check ((source_type is null) = (source_id is null)),
  check (
    (movement_type in ('receipt', 'return', 'transfer_in') and quantity > 0)
    or (movement_type in ('issue', 'sale', 'transfer_out') and quantity < 0)
    or movement_type = 'adjustment'
  )
);
-- Idempotencia a nivel de BD: una línea de documento se contabiliza una sola vez,
-- aunque dos peticiones lleguen a la vez.
create unique index stock_movements_source_line_key
  on public.stock_movements (organization_id, source_type, source_line_id)
  where source_line_id is not null;
create index stock_movements_item_idx on public.stock_movements (organization_id, item_id, warehouse_id, occurred_at desc);
create index stock_movements_source_idx on public.stock_movements (organization_id, source_type, source_id);

-- Antes de insertar: solo artículos inventariables; las salidas se valoran al coste medio vigente.
create or replace function app.prepare_stock_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_type text;
begin
  select item_type into v_type
  from public.inventory_items
  where organization_id = new.organization_id and id = new.item_id;

  if not found then
    raise exception 'El artículo % no existe en la organización', new.item_id using errcode = '23503';
  elsif v_type <> 'stockable' then
    raise exception 'El artículo % no es inventariable', new.item_id using errcode = 'OM002';
  end if;

  if new.quantity < 0 and new.unit_cost is null then
    select sl.avg_unit_cost into new.unit_cost
    from public.stock_levels sl
    where sl.organization_id = new.organization_id
      and sl.warehouse_id = new.warehouse_id
      and sl.item_id = new.item_id;
  end if;
  return new;
end
$$;

-- Después de insertar: aplica el delta al saldo, en la misma transacción.
--   * Salidas: UPDATE (bloquea la fila). No vale un upsert, porque INSERT ... ON
--     CONFLICT evalúa la CHECK sobre la fila propuesta (cantidad negativa) antes
--     de resolver el conflicto.
--   * Entradas: upsert con recálculo del coste medio ponderado.
-- En ambos casos el bloqueo de fila serializa los movimientos concurrentes del
-- mismo artículo/almacén sin perder actualizaciones.
create or replace function app.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.quantity < 0 then
    update public.stock_levels
    set on_hand = on_hand + new.quantity,
        updated_at = now()
    where organization_id = new.organization_id
      and warehouse_id = new.warehouse_id
      and item_id = new.item_id;
    if not found then
      raise exception 'Sin existencias del artículo % en el almacén %', new.item_id, new.warehouse_id
        using errcode = '23514', constraint = 'stock_levels_on_hand_non_negative';
    end if;
    return null;
  end if;

  insert into public.stock_levels as sl (organization_id, warehouse_id, item_id, on_hand, avg_unit_cost)
  values (new.organization_id, new.warehouse_id, new.item_id, new.quantity, coalesce(new.unit_cost, 0))
  on conflict (organization_id, warehouse_id, item_id) do update
  set on_hand = sl.on_hand + excluded.on_hand,
      avg_unit_cost = case
        when new.unit_cost is null then sl.avg_unit_cost
        else round(
          (greatest(sl.on_hand, 0) * sl.avg_unit_cost + excluded.on_hand * new.unit_cost)
          / (greatest(sl.on_hand, 0) + excluded.on_hand),
          6)
      end,
      updated_at = now();
  return null;
end
$$;

create trigger stock_movements_prepare before insert on public.stock_movements
  for each row execute function app.prepare_stock_movement();
create trigger stock_movements_apply after insert on public.stock_movements
  for each row execute function app.apply_stock_movement();
create trigger stock_movements_immutable before update or delete on public.stock_movements
  for each row execute function app.forbid_mutation();

-- ---------------------------------------------------------------------
-- Entradas de mercancía (albaranes de proveedor)
-- ---------------------------------------------------------------------

create table public.goods_receipts (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete restrict,
  number                 bigint,                         -- correlativo interno (trigger)
  warehouse_id           uuid not null,
  supplier_id            uuid not null,
  supplier_delivery_note text not null,                  -- nº de albarán del proveedor
  status                 text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  received_at            timestamptz not null default now(),
  posted_at              timestamptz,
  posted_by              uuid references public.users (id),
  notes                  text,
  custom_fields          jsonb not null default '{}' check (jsonb_typeof(custom_fields) = 'object'),
  created_by             uuid references public.users (id) default app.current_user_id(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  unique (organization_id, supplier_id, supplier_delivery_note),   -- el mismo albarán no entra dos veces
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id),
  foreign key (organization_id, supplier_id) references public.parties (organization_id, id),
  check ((status = 'posted') = (posted_at is not null and posted_by is not null))
);
create index goods_receipts_status_idx on public.goods_receipts (organization_id, status, received_at desc);

create table public.goods_receipt_lines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  receipt_id      uuid not null,
  line_no         integer not null check (line_no > 0),
  item_id         uuid not null,
  quantity        numeric(18, 4) not null check (quantity > 0),
  unit_cost       numeric(18, 6) not null check (unit_cost >= 0),
  unique (receipt_id, line_no),
  unique (organization_id, id),
  foreign key (organization_id, receipt_id) references public.goods_receipts (organization_id, id) on delete cascade,
  foreign key (organization_id, item_id) references public.inventory_items (organization_id, id)
);

-- Ciclo de vida: draft → posted | cancelled. Un albarán contabilizado es definitivo
-- (se corrige con un ajuste o una devolución, nunca editándolo).
create or replace function app.guard_goods_receipt() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Solo se pueden borrar albaranes en borrador' using errcode = 'OM001';
    end if;
    return old;
  end if;
  if old.status <> 'draft' then
    raise exception 'El albarán % ya está %', old.number, old.status using errcode = 'OM001';
  end if;
  return new;
end
$$;

create or replace function app.guard_goods_receipt_line() returns trigger
language plpgsql as $$
declare
  v_status text;
begin
  select status into v_status
  from public.goods_receipts
  where organization_id = coalesce(new.organization_id, old.organization_id)
    and id = coalesce(new.receipt_id, old.receipt_id);
  -- v_status es NULL durante el borrado en cascada de la cabecera (ya borrada).
  if v_status is not null and v_status <> 'draft' then
    raise exception 'No se pueden modificar líneas de un albarán %', v_status using errcode = 'OM001';
  end if;
  return coalesce(new, old);
end
$$;

create trigger goods_receipts_number before insert on public.goods_receipts
  for each row execute function app.assign_document_number('goods_receipt');
create trigger goods_receipts_guard before update or delete on public.goods_receipts
  for each row execute function app.guard_goods_receipt();
create trigger goods_receipts_touch before update on public.goods_receipts
  for each row execute function app.touch_updated_at();
create trigger goods_receipts_audit after insert or update or delete on public.goods_receipts
  for each row execute function app.audit_row();
create trigger goods_receipt_lines_guard before insert or update or delete on public.goods_receipt_lines
  for each row execute function app.guard_goods_receipt_line();

create trigger price_lists_touch before update on public.price_lists for each row execute function app.touch_updated_at();
create trigger parties_touch before update on public.parties for each row execute function app.touch_updated_at();
create trigger warehouses_touch before update on public.warehouses for each row execute function app.touch_updated_at();
create trigger inventory_items_touch before update on public.inventory_items for each row execute function app.touch_updated_at();
create trigger inventory_items_audit after insert or update or delete on public.inventory_items
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

select app.apply_tenant_policies('public.price_lists', 'parties');
select app.apply_tenant_policies('public.price_list_items', 'parties');
select app.apply_tenant_policies('public.parties', 'parties');
select app.apply_tenant_policies('public.warehouses', 'inventory');
select app.apply_tenant_policies('public.inventory_items', 'inventory');
select app.apply_tenant_policies('public.goods_receipts', 'inventory');
select app.apply_tenant_policies('public.goods_receipt_lines', 'inventory');

-- Contabilizar un albarán (draft → posted) exige un permiso propio.
create policy goods_receipts_post on public.goods_receipts as restrictive for update to app_user
  using (true)
  with check (status <> 'posted' or organization_id in (select app.authorized_org_ids('inventory.post')));

-- Libro de movimientos: lectura con inventory.read; alta solo con inventory.post; nunca UPDATE/DELETE.
alter table public.stock_movements enable row level security;
create policy stock_movements_select on public.stock_movements for select to app_user
  using (organization_id in (select app.authorized_org_ids('inventory.read')));
create policy stock_movements_insert on public.stock_movements for insert to app_user
  with check (
    organization_id in (select app.authorized_org_ids('inventory.post'))
    and created_by = (select app.current_user_id())
  );
grant select, insert on public.stock_movements to app_user;

-- Saldo: lectura con inventory.read; solo el umbral mínimo es editable (privilegio de columna).
alter table public.stock_levels enable row level security;
create policy stock_levels_select on public.stock_levels for select to app_user
  using (organization_id in (select app.authorized_org_ids('inventory.read')));
create policy stock_levels_update on public.stock_levels for update to app_user
  using (organization_id in (select app.authorized_org_ids('inventory.write')))
  with check (organization_id in (select app.authorized_org_ids('inventory.write')));
grant select, update (min_quantity) on public.stock_levels to app_user;
