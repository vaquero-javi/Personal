-- =====================================================================
-- Omnia · 0012 · TPV de hostelería
--
--   * Terminales vinculados con un código de un solo uso; el dispositivo
--     guarda un token (aquí solo su hash).
--   * Acceso del personal por PIN en un terminal vinculado. Los hashes de
--     PIN no son legibles por app_user: solo pasan por funciones.
--   * Sala (mesas), carta (categorías), cuentas abiertas y sus líneas.
--   * Caja por terminal: apertura, movimientos, cierre con arqueo y
--     reporte Z calculado en la base de datos.
--   * Escandallos: al vender un producto con receta se descuentan sus
--     ingredientes del almacén del terminal.
--   * Stock negativo opcional por empresa (settings.allow_negative_stock):
--     en una barra no se puede dejar de cobrar porque el inventario no cuadre.
-- SQL portable (PostgreSQL 15+).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Permisos y roles de sala
-- ---------------------------------------------------------------------

insert into public.permissions (code, module, description) values
  ('pos.*',      'pos', 'Todo sobre el TPV'),
  ('pos.use',    'pos', 'Usar el TPV: mesas, comandas y cobro'),
  ('pos.manage', 'pos', 'Encargado de TPV: caja, arqueo, carta, escandallos, descuentos y anulaciones');

-- Crea (si faltan) los roles Camarero y Encargado, y da el TPV a Administración.
-- El camarero necesita emitir tickets y descontar stock: la RLS de facturas y
-- movimientos lo exige igual que a cualquier otro usuario.
create or replace function app.seed_pos_roles(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_waiter  uuid;
  v_manager uuid;
begin
  insert into public.roles (organization_id, key, name)
  values (p_org, 'waiter', 'Camarero')
  on conflict (organization_id, key) do nothing
  returning id into v_waiter;
  if v_waiter is not null then
    insert into public.role_permissions (organization_id, role_id, permission_code)
    select p_org, v_waiter, p from unnest(array[
      'members.read', 'hr.time.self', 'hr.leave.request', 'incidents.write',
      'pos.use', 'sales.read', 'inventory.read', 'inventory.post',
      'invoicing.read', 'invoicing.write', 'invoicing.issue'
    ]) p;
  end if;

  insert into public.roles (organization_id, key, name)
  values (p_org, 'floor_manager', 'Encargado')
  on conflict (organization_id, key) do nothing
  returning id into v_manager;
  if v_manager is not null then
    insert into public.role_permissions (organization_id, role_id, permission_code)
    select p_org, v_manager, p from unnest(array[
      'members.read', 'hr.time.self', 'hr.leave.request', 'hr.time.read', 'hr.shifts.manage',
      'incidents.*', 'pos.*', 'sales.*', 'inventory.*', 'parties.read', 'parties.write',
      'invoicing.read', 'invoicing.write', 'invoicing.issue'
    ]) p;
  end if;

  insert into public.role_permissions (organization_id, role_id, permission_code)
  select r.organization_id, r.id, 'pos.*'
  from public.roles r
  where r.organization_id = p_org and r.key = 'admin'
  on conflict do nothing;
end
$$;
revoke all on function app.seed_pos_roles(uuid) from public;

select app.seed_pos_roles(id) from public.organizations;

-- Las organizaciones nuevas nacen con los roles de sala.
create or replace function app.create_organization(
  p_slug       text,
  p_legal_name text,
  p_tax_id     text,
  p_parent_id  uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user     uuid := app.current_user_id();
  v_org      uuid;
  v_owner    uuid;
  v_admin    uuid;
  v_employee uuid;
begin
  if v_user is null then
    raise exception 'Sesión sin usuario autenticado' using errcode = '42501';
  end if;

  if p_parent_id is not null and not exists (
       select 1
       from public.user_organizations uo
       join public.role_permissions rp on rp.role_id = uo.role_id
       where uo.user_id = v_user and uo.organization_id = p_parent_id and uo.status = 'active'
         and rp.permission_code in ('*', 'org.*', 'org.manage')
     ) then
    raise exception 'Sin permiso sobre la organización matriz' using errcode = '42501';
  end if;

  insert into public.organizations (slug, legal_name, tax_id, parent_id, spine_color)
  values (
    p_slug, p_legal_name, p_tax_id, p_parent_id,
    (array['red', 'blue', 'yellow', 'green'])[
      1 + (select count(*) from public.user_organizations where user_id = v_user) % 4
    ]
  )
  returning id into v_org;

  insert into public.roles (organization_id, key, name, is_system)
  values (v_org, 'owner', 'Propietario', true) returning id into v_owner;
  insert into public.roles (organization_id, key, name, is_system)
  values (v_org, 'admin', 'Administración', false) returning id into v_admin;
  insert into public.roles (organization_id, key, name, is_system)
  values (v_org, 'employee', 'Empleado', false) returning id into v_employee;

  insert into public.role_permissions (organization_id, role_id, permission_code)
  select v_org, v_owner, '*'
  union all
  select v_org, v_admin, p from unnest(array[
    'members.read', 'members.manage', 'parties.*', 'inventory.*', 'invoicing.*',
    'purchasing.*', 'sales.*', 'hr.*', 'incidents.*', 'audit.read'
  ]) p
  union all
  select v_org, v_employee, p from unnest(array[
    'members.read', 'hr.time.self', 'hr.leave.request', 'incidents.read', 'incidents.write',
    'inventory.read', 'sales.read'
  ]) p;

  perform app.seed_pos_roles(v_org);

  insert into public.user_organizations (user_id, organization_id, role_id, is_default)
  values (
    v_user, v_org, v_owner,
    not exists (select 1 from public.user_organizations where user_id = v_user and is_default)
  );

  return v_org;
end
$$;

-- ---------------------------------------------------------------------
-- Stock negativo opcional por empresa
-- stock_levels solo lo escribe el trigger del libro, así que basta con
-- comprobarlo ahí en lugar de con una CHECK incondicional.
-- ---------------------------------------------------------------------

create or replace function app.allows_negative_stock(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((settings ->> 'allow_negative_stock')::boolean, false)
  from public.organizations where id = p_org
$$;

alter table public.stock_levels drop constraint stock_levels_on_hand_non_negative;
alter table public.stock_levels drop constraint stock_levels_reserved_valid;
alter table public.stock_levels
  add constraint stock_levels_reserved_valid check (reserved >= 0 and reserved <= greatest(on_hand, 0));

create or replace function app.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_on_hand numeric;
begin
  if new.quantity < 0 then
    update public.stock_levels
    set on_hand = on_hand + new.quantity,
        updated_at = now()
    where organization_id = new.organization_id
      and warehouse_id = new.warehouse_id
      and item_id = new.item_id
    returning on_hand into v_on_hand;
    if not found then
      if not app.allows_negative_stock(new.organization_id) then
        raise exception 'Sin existencias del artículo % en el almacén %', new.item_id, new.warehouse_id
          using errcode = '23514', constraint = 'stock_levels_on_hand_non_negative';
      end if;
      insert into public.stock_levels (organization_id, warehouse_id, item_id, on_hand)
      values (new.organization_id, new.warehouse_id, new.item_id, new.quantity);
      return null;
    end if;
    if v_on_hand < 0 and not app.allows_negative_stock(new.organization_id) then
      raise exception 'No hay existencias suficientes del artículo %', new.item_id
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

-- ---------------------------------------------------------------------
-- Políticas de las tablas del TPV: lectura con un permiso, escritura con otro.
-- ---------------------------------------------------------------------

create or replace function app.apply_pos_policies(p_table regclass, p_read text, p_write text, p_delete text default null)
returns void
language plpgsql as $$
declare
  v_name text := (select relname from pg_class where oid = p_table);
begin
  execute format('alter table %s enable row level security', p_table);
  execute format(
    'create policy %I on %s for select to app_user using (organization_id in (select app.authorized_org_ids(%L)))',
    v_name || '_select', p_table, p_read);
  execute format(
    'create policy %I on %s for insert to app_user with check (organization_id in (select app.authorized_org_ids(%L)))',
    v_name || '_insert', p_table, p_write);
  execute format(
    'create policy %I on %s for update to app_user using (organization_id in (select app.authorized_org_ids(%L))) with check (organization_id in (select app.authorized_org_ids(%L)))',
    v_name || '_update', p_table, p_write, p_write);
  if p_delete is not null then
    execute format(
      'create policy %I on %s for delete to app_user using (organization_id in (select app.authorized_org_ids(%L)))',
      v_name || '_delete', p_table, p_delete);
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Terminales
-- ---------------------------------------------------------------------

create table public.pos_terminals (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 60),
  warehouse_id       uuid not null,                 -- de dónde descuenta stock
  token_hash         text unique,                   -- sha256 del token del dispositivo
  pairing_code_hash  text unique,                   -- sha256 del código de vinculación
  pairing_expires_at timestamptz,
  paired_at          timestamptz,
  last_seen_at       timestamptz,
  revoked_at         timestamptz,
  created_by         uuid references public.users (id) default app.current_user_id(),
  created_at         timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id),
  check ((pairing_code_hash is null) = (pairing_expires_at is null))
);

alter table public.pos_terminals enable row level security;
create policy pos_terminals_select on public.pos_terminals for select to app_user
  using (organization_id in (select app.authorized_org_ids('pos.manage')));
create policy pos_terminals_insert on public.pos_terminals for insert to app_user
  with check (organization_id in (select app.authorized_org_ids('pos.manage')));
create policy pos_terminals_update on public.pos_terminals for update to app_user
  using (organization_id in (select app.authorized_org_ids('pos.manage')))
  with check (organization_id in (select app.authorized_org_ids('pos.manage')));
-- Los hashes no se leen; el token solo lo escribe la vinculación.
grant select (id, organization_id, name, warehouse_id, pairing_expires_at, paired_at, last_seen_at, revoked_at, created_by, created_at)
  on public.pos_terminals to app_user;
grant insert (organization_id, name, warehouse_id, pairing_code_hash, pairing_expires_at) on public.pos_terminals to app_user;
grant update (name, warehouse_id, pairing_code_hash, pairing_expires_at, revoked_at) on public.pos_terminals to app_user;

-- Canjea un código de vinculación vigente por el token del dispositivo.
-- Sin sesión de usuario: la tablet aún no sabe quién la usa.
create or replace function app.pos_pair_terminal(p_code_hash text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  update public.pos_terminals
  set token_hash = p_token_hash,
      pairing_code_hash = null,
      pairing_expires_at = null,
      paired_at = now(),
      last_seen_at = now(),
      revoked_at = null
  where pairing_code_hash = p_code_hash and pairing_expires_at > now()
  returning id into v_id;
  return v_id;
end
$$;

-- Terminal de un token (null si no existe o está desvinculado).
create or replace function app.pos_terminal(p_token_hash text)
returns table (
  terminal_id uuid, organization_id uuid, terminal_name text, warehouse_id uuid, warehouse_name text,
  org_slug text, org_name text, allow_negative_stock boolean
)
language plpgsql security definer set search_path = '' as $$
begin
  update public.pos_terminals t set last_seen_at = now()
  where t.token_hash = p_token_hash and t.revoked_at is null
    and (t.last_seen_at is null or t.last_seen_at < now() - interval '1 minute');
  return query
    select t.id, t.organization_id, t.name, t.warehouse_id, w.name, o.slug,
           coalesce(o.trade_name, o.legal_name), coalesce((o.settings ->> 'allow_negative_stock')::boolean, false)
    from public.pos_terminals t
    join public.organizations o on o.id = t.organization_id
    join public.warehouses w on w.organization_id = t.organization_id and w.id = t.warehouse_id
    where t.token_hash = p_token_hash and t.revoked_at is null;
end
$$;

-- ---------------------------------------------------------------------
-- PIN del personal
-- ---------------------------------------------------------------------

create table public.pos_staff_pins (
  organization_id uuid not null,
  user_id         uuid not null,
  pin_hash        text not null,            -- scrypt con sal, calculado en el servidor
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (organization_id, user_id),
  foreign key (organization_id, user_id) references public.user_organizations (organization_id, user_id) on delete cascade
);
-- Sin políticas ni GRANT: app_user no lee hashes; todo pasa por funciones.
alter table public.pos_staff_pins enable row level security;

-- Personal que puede entrar en el terminal: miembros activos con pos.use.
create or replace function app.pos_terminal_staff(p_token_hash text)
returns table (user_id uuid, full_name text, role_name text, has_pin boolean, can_manage boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, coalesce(u.full_name, u.email), r.name, p.pin_hash is not null,
         exists (select 1 from public.role_permissions rp
                 where rp.role_id = r.id and rp.permission_code in ('*', 'pos.*', 'pos.manage'))
  from public.pos_terminals t
  join public.user_organizations uo on uo.organization_id = t.organization_id and uo.status = 'active'
  join public.users u on u.id = uo.user_id
  join public.roles r on r.id = uo.role_id
  left join public.pos_staff_pins p on p.organization_id = uo.organization_id and p.user_id = uo.user_id
  where t.token_hash = p_token_hash and t.revoked_at is null
    and exists (select 1 from public.role_permissions rp
                where rp.role_id = r.id and rp.permission_code in ('*', 'pos.*', 'pos.use'))
  order by coalesce(u.full_name, u.email)
$$;

-- Asigna o cambia un PIN: el propio usuario o un encargado. El PIN de un
-- propietario solo lo pone otro propietario (no sirve para suplantarlo).
create or replace function app.pos_set_pin(p_org uuid, p_user uuid, p_pin_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (p_org in (select app.active_org_ids())) then
    raise exception 'Organización fuera del contexto activo' using errcode = '42501';
  end if;
  if p_user is distinct from app.current_user_id() then
    if not (p_org in (select app.authorized_org_ids('pos.manage'))) then
      raise exception 'Solo un encargado asigna el PIN de otra persona' using errcode = '42501';
    end if;
    if exists (
         select 1 from public.user_organizations uo
         join public.role_permissions rp on rp.role_id = uo.role_id
         where uo.organization_id = p_org and uo.user_id = p_user and rp.permission_code = '*'
       ) and not (p_org in (select app.authorized_org_ids('*'))) then
      raise exception 'El PIN de un propietario solo lo cambia un propietario' using errcode = '42501';
    end if;
  end if;
  insert into public.pos_staff_pins as p (organization_id, user_id, pin_hash)
  values (p_org, p_user, p_pin_hash)
  on conflict (organization_id, user_id) do update
  set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
end
$$;

-- Quién tiene PIN (sin exponer hashes), para el encargado.
create or replace function app.pos_pin_status()
returns table (organization_id uuid, user_id uuid, has_pin boolean, locked_until timestamptz)
language sql stable security definer set search_path = '' as $$
  select uo.organization_id, uo.user_id, p.pin_hash is not null, p.locked_until
  from public.user_organizations uo
  left join public.pos_staff_pins p on p.organization_id = uo.organization_id and p.user_id = uo.user_id
  where uo.organization_id in (select app.authorized_org_ids('pos.manage'))
$$;

-- Quita el PIN de alguien (encargado) o el propio.
create or replace function app.pos_clear_pin(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (p_org in (select app.active_org_ids()))
     or (p_user is distinct from app.current_user_id() and not (p_org in (select app.authorized_org_ids('pos.manage')))) then
    raise exception 'Solo un encargado quita el PIN de otra persona' using errcode = '42501';
  end if;
  delete from public.pos_staff_pins where organization_id = p_org and user_id = p_user;
end
$$;

-- Hash del PIN para comprobarlo en el servidor (solo en un terminal vinculado).
create or replace function app.pos_pin_challenge(p_token_hash text, p_user uuid)
returns table (pin_hash text, locked_until timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.pin_hash, p.locked_until
  from public.pos_terminals t
  join public.user_organizations uo on uo.organization_id = t.organization_id and uo.user_id = p_user and uo.status = 'active'
  join public.pos_staff_pins p on p.organization_id = t.organization_id and p.user_id = p_user
  where t.token_hash = p_token_hash and t.revoked_at is null
$$;

-- Resultado del intento: 5 fallos seguidos bloquean el PIN 5 minutos.
create or replace function app.pos_pin_result(p_token_hash text, p_user uuid, p_ok boolean) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_locked timestamptz;
begin
  update public.pos_staff_pins p
  set failed_attempts = case when p_ok then 0 else p.failed_attempts + 1 end,
      locked_until = case
        when p_ok then null
        when p.failed_attempts + 1 >= 5 then now() + interval '5 minutes'
        else p.locked_until
      end
  from public.pos_terminals t
  where t.token_hash = p_token_hash and t.revoked_at is null
    and p.organization_id = t.organization_id and p.user_id = p_user
  returning p.locked_until into v_locked;
  return v_locked;
end
$$;

-- ---------------------------------------------------------------------
-- Sala y carta
-- ---------------------------------------------------------------------

create table public.pos_tables (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 30),
  area            text not null default 'Sala' check (char_length(area) between 1 and 30),
  seats           integer not null default 4 check (seats between 1 and 99),
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);
select app.apply_pos_policies('public.pos_tables', 'pos.use', 'pos.manage', 'pos.manage');
grant select, insert, update, delete on public.pos_tables to app_user;

create table public.pos_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 30),
  icon            text not null default 'utensils'
                  check (icon in ('beer', 'wine', 'martini', 'cup-soda', 'coffee', 'utensils', 'salad', 'beef', 'fish', 'ice-cream', 'sandwich', 'pizza')),
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);
select app.apply_pos_policies('public.pos_categories', 'pos.use', 'pos.manage', 'pos.manage');
grant select, insert, update, delete on public.pos_categories to app_user;

-- Un artículo aparece en la carta del TPV si tiene categoría.
alter table public.inventory_items add column pos_category_id uuid;
alter table public.inventory_items
  add constraint inventory_items_pos_category_fk foreign key (organization_id, pos_category_id)
  references public.pos_categories (organization_id, id) on delete set null (pos_category_id);
create index inventory_items_pos_category_idx on public.inventory_items (organization_id, pos_category_id)
  where pos_category_id is not null;

-- ---------------------------------------------------------------------
-- Caja
-- ---------------------------------------------------------------------

create table public.cash_sessions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  number          bigint,
  terminal_id     uuid not null,
  status          text not null default 'open' check (status in ('open', 'closed')),
  opened_at       timestamptz not null default now(),
  opened_by       uuid not null references public.users (id) default app.current_user_id(),
  opening_float   numeric(18, 2) not null check (opening_float >= 0),
  closed_at       timestamptz,
  closed_by       uuid references public.users (id),
  counted_cash    numeric(18, 2) check (counted_cash >= 0),
  count_detail    jsonb check (count_detail is null or jsonb_typeof(count_detail) = 'object'),
  expected_cash   numeric(18, 2),
  difference      numeric(18, 2),
  report          jsonb,
  notes           text,
  unique (organization_id, id),
  unique (organization_id, number),
  foreign key (organization_id, terminal_id) references public.pos_terminals (organization_id, id),
  check ((status = 'closed') = (closed_at is not null and closed_by is not null and counted_cash is not null
                                and expected_cash is not null and difference is not null))
);
create unique index cash_sessions_one_open on public.cash_sessions (organization_id, terminal_id) where status = 'open';
create index cash_sessions_terminal_idx on public.cash_sessions (organization_id, terminal_id, opened_at desc);

create trigger cash_sessions_number before insert on public.cash_sessions
  for each row execute function app.assign_document_number('cash_session');
create trigger cash_sessions_audit after insert or update on public.cash_sessions
  for each row execute function app.audit_row();

alter table public.cash_sessions enable row level security;
create policy cash_sessions_select on public.cash_sessions for select to app_user
  using (organization_id in (select app.authorized_org_ids('pos.use')));
create policy cash_sessions_insert on public.cash_sessions for insert to app_user
  with check (organization_id in (select app.authorized_org_ids('pos.manage')) and opened_by = (select app.current_user_id()));
-- Abrir es un INSERT; cerrar solo con app.close_cash_session() (calcula lo esperado).
grant select, insert (organization_id, terminal_id, opening_float, notes) on public.cash_sessions to app_user;

create table public.cash_movements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cash_session_id uuid not null,
  kind            text not null check (kind in ('withdrawal', 'deposit')),
  amount          numeric(18, 2) not null check (amount > 0),
  reason          text not null check (char_length(reason) between 1 and 200),
  created_by      uuid not null references public.users (id) default app.current_user_id(),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, cash_session_id) references public.cash_sessions (organization_id, id)
);
create index cash_movements_session_idx on public.cash_movements (organization_id, cash_session_id);

create or replace function app.guard_cash_movement() returns trigger
language plpgsql as $$
begin
  if not exists (
       select 1 from public.cash_sessions
       where organization_id = new.organization_id and id = new.cash_session_id and status = 'open'
     ) then
    raise exception 'La caja está cerrada' using errcode = 'OM002';
  end if;
  return new;
end
$$;
create trigger cash_movements_guard before insert on public.cash_movements
  for each row execute function app.guard_cash_movement();
create trigger cash_movements_immutable before update or delete on public.cash_movements
  for each row execute function app.forbid_mutation();

alter table public.cash_movements enable row level security;
create policy cash_movements_select on public.cash_movements for select to app_user
  using (organization_id in (select app.authorized_org_ids('pos.use')));
create policy cash_movements_insert on public.cash_movements for insert to app_user
  with check (organization_id in (select app.authorized_org_ids('pos.manage')) and created_by = (select app.current_user_id()));
grant select, insert on public.cash_movements to app_user;

-- Cada cobro del TPV cuenta en la caja abierta del terminal.
alter table public.invoice_payments add column cash_session_id uuid;
alter table public.invoice_payments
  add constraint invoice_payments_cash_session_fk foreign key (organization_id, cash_session_id)
  references public.cash_sessions (organization_id, id);
create index invoice_payments_cash_session_idx on public.invoice_payments (organization_id, cash_session_id)
  where cash_session_id is not null;

create or replace function app.guard_payment_cash_session() returns trigger
language plpgsql as $$
begin
  if new.cash_session_id is not null and not exists (
       select 1 from public.cash_sessions
       where organization_id = new.organization_id and id = new.cash_session_id and status = 'open'
     ) then
    raise exception 'La caja está cerrada: ábrela antes de cobrar' using errcode = 'OM002';
  end if;
  return new;
end
$$;
create trigger invoice_payments_cash_session before insert on public.invoice_payments
  for each row execute function app.guard_payment_cash_session();

-- ---------------------------------------------------------------------
-- Cuentas (mesas abiertas) y sus consumiciones
-- ---------------------------------------------------------------------

create table public.pos_tabs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  number          bigint,
  table_id        uuid,
  label           text check (label is null or char_length(label) between 1 and 40),   -- barra, para llevar…
  terminal_id     uuid,
  waiter_id       uuid not null default app.current_user_id(),
  guests          integer not null default 1 check (guests between 1 and 99),
  status          text not null default 'open' check (status in ('open', 'billing', 'paid', 'cancelled')),
  opened_at       timestamptz not null default now(),
  precheck_at     timestamptz,                -- pre-ticket impreso
  closed_at       timestamptz,
  closed_by       uuid references public.users (id),
  invoice_id      uuid,
  cash_session_id uuid,
  cancel_reason   text,
  unique (organization_id, id),
  unique (organization_id, number),
  foreign key (organization_id, table_id) references public.pos_tables (organization_id, id),
  foreign key (organization_id, terminal_id) references public.pos_terminals (organization_id, id),
  foreign key (organization_id, waiter_id) references public.user_organizations (organization_id, user_id),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id),
  foreign key (organization_id, cash_session_id) references public.cash_sessions (organization_id, id),
  check (table_id is not null or label is not null),
  check ((status = 'paid') = (invoice_id is not null)),
  check ((status in ('paid', 'cancelled')) = (closed_at is not null))
);
-- Una mesa tiene como mucho una cuenta abierta.
create unique index pos_tabs_one_open_per_table on public.pos_tabs (organization_id, table_id)
  where status in ('open', 'billing') and table_id is not null;
create index pos_tabs_open_idx on public.pos_tabs (organization_id, status) where status in ('open', 'billing');
create index pos_tabs_session_idx on public.pos_tabs (organization_id, cash_session_id) where cash_session_id is not null;

create table public.pos_tab_lines (
  id              uuid primary key,          -- lo genera el terminal: reintentar no duplica
  organization_id uuid not null,
  tab_id          uuid not null,
  item_id         uuid not null,
  description     text not null,
  quantity        numeric(18, 4) not null check (quantity > 0),
  unit_price      numeric(18, 4) not null check (unit_price >= 0),     -- sin impuestos
  tax_rate        numeric(5, 2) not null check (tax_rate >= 0),
  discount_pct    numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  note            text check (note is null or char_length(note) <= 120),
  sent_at         timestamptz,               -- enviado a cocina / barra
  added_by        uuid not null references public.users (id) default app.current_user_id(),
  created_at      timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, tab_id) references public.pos_tabs (organization_id, id),
  foreign key (organization_id, item_id) references public.inventory_items (organization_id, id)
);
create index pos_tab_lines_tab_idx on public.pos_tab_lines (organization_id, tab_id, created_at);

-- Una cuenta cerrada es definitiva. Anular una con consumiciones es cosa de encargado.
create or replace function app.guard_pos_tab() returns trigger
language plpgsql as $$
begin
  if old.status in ('paid', 'cancelled') then
    raise exception 'La cuenta % ya está cerrada', old.number using errcode = 'OM001';
  end if;
  if new.status = 'cancelled'
     and exists (select 1 from public.pos_tab_lines l where l.organization_id = old.organization_id and l.tab_id = old.id)
     and not app.has_permission(old.organization_id, 'pos.manage') then
    raise exception 'Anular una cuenta con consumiciones requiere a un encargado' using errcode = 'OM002';
  end if;
  return new;
end
$$;

-- Las líneas solo cambian con la cuenta abierta. Quitar lo ya enviado a cocina y
-- aplicar descuentos exige pos.manage; el precio y el artículo no se reescriben.
create or replace function app.guard_pos_tab_line() returns trigger
language plpgsql as $$
declare
  v_org    uuid;
  v_tab    uuid;
  v_status text;
  v_manage boolean;
begin
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

create trigger pos_tabs_number before insert on public.pos_tabs
  for each row execute function app.assign_document_number('pos_tab');
create trigger pos_tabs_guard before update on public.pos_tabs
  for each row execute function app.guard_pos_tab();
create trigger pos_tabs_audit after insert or update on public.pos_tabs
  for each row execute function app.audit_row();
create trigger pos_tab_lines_guard before insert or update or delete on public.pos_tab_lines
  for each row execute function app.guard_pos_tab_line();
create trigger pos_tab_lines_audit after delete on public.pos_tab_lines
  for each row execute function app.audit_row();

select app.apply_pos_policies('public.pos_tabs', 'pos.use', 'pos.use');
grant select, insert, update on public.pos_tabs to app_user;
select app.apply_pos_policies('public.pos_tab_lines', 'pos.use', 'pos.use', 'pos.use');
grant select, insert, update, delete on public.pos_tab_lines to app_user;

-- ---------------------------------------------------------------------
-- Escandallos
-- ---------------------------------------------------------------------

create table public.recipe_lines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  product_id      uuid not null,
  ingredient_id   uuid not null,
  quantity        numeric(18, 4) not null check (quantity > 0),    -- en la unidad del ingrediente
  unique (organization_id, product_id, ingredient_id),
  foreign key (organization_id, product_id) references public.inventory_items (organization_id, id) on delete cascade,
  foreign key (organization_id, ingredient_id) references public.inventory_items (organization_id, id),
  check (product_id <> ingredient_id)
);
create index recipe_lines_ingredient_idx on public.recipe_lines (organization_id, ingredient_id);

create or replace function app.guard_recipe_line() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
       select 1 from public.inventory_items
       where organization_id = new.organization_id and id = new.ingredient_id and item_type = 'stockable'
     ) then
    raise exception 'Un ingrediente debe ser un artículo inventariable' using errcode = 'OM002';
  end if;
  return new;
end
$$;
create trigger recipe_lines_guard before insert or update on public.recipe_lines
  for each row execute function app.guard_recipe_line();
create trigger recipe_lines_audit after insert or update or delete on public.recipe_lines
  for each row execute function app.audit_row();

select app.apply_tenant_policies('public.recipe_lines', 'inventory');

-- Carta del terminal: artículos con categoría y precio en la tarifa general.
-- PVP con impuestos y precio unitario sin impuestos (lo que va al ticket).
-- DEFINER para que el camarero no necesite leer tarifas ni terceros.
create or replace function app.pos_menu(p_warehouse uuid)
returns table (
  item_id uuid, name text, category_id uuid, unit_price numeric, pvp numeric, tax_rate numeric,
  on_hand numeric, track_stock boolean, has_recipe boolean
)
language sql stable security definer set search_path = '' as $$
  select i.id, i.name, i.pos_category_id,
         case when pl.prices_include_tax then round(pli.unit_price / (1 + i.default_tax_rate / 100), 4) else pli.unit_price end,
         case when pl.prices_include_tax then round(pli.unit_price, 2) else round(pli.unit_price * (1 + i.default_tax_rate / 100), 2) end,
         i.default_tax_rate,
         sl.on_hand,
         i.item_type = 'stockable',
         exists (select 1 from public.recipe_lines r where r.organization_id = i.organization_id and r.product_id = i.id)
  from public.inventory_items i
  join public.pos_categories c on c.organization_id = i.organization_id and c.id = i.pos_category_id and c.is_active
  join public.price_lists pl on pl.organization_id = i.organization_id and pl.is_default
  join lateral (
    select x.unit_price from public.price_list_items x
    where x.price_list_id = pl.id and x.item_id = i.id
    order by x.min_quantity limit 1
  ) pli on true
  left join public.stock_levels sl on sl.organization_id = i.organization_id and sl.item_id = i.id and sl.warehouse_id = p_warehouse
  where i.is_active and i.organization_id in (select app.authorized_org_ids('pos.use'))
  order by c.sort_order, c.name, i.name
$$;

-- ---------------------------------------------------------------------
-- Reporte de caja (X en vivo, Z al cerrar)
-- SECURITY INVOKER: en vivo lo lee quien tiene acceso; el cierre lo congela.
-- ---------------------------------------------------------------------

create or replace function app.cash_session_summary(p_session uuid) returns jsonb
language sql stable as $$
  with s as (
    select * from public.cash_sessions where id = p_session
  ),
  pays as (
    select p.invoice_id, p.method, p.amount from public.invoice_payments p, s
    where p.organization_id = s.organization_id and p.cash_session_id = s.id
  ),
  inv as (
    select i.id, i.full_number, i.fiscal_record_at, i.number from public.invoices i
    where i.id in (select invoice_id from pays)
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
    from pays
  ),
  moves as (
    select coalesce(sum(amount) filter (where kind = 'deposit'), 0) as deposits,
           coalesce(sum(amount) filter (where kind = 'withdrawal'), 0) as withdrawals
    from mov
  )
  select jsonb_build_object(
    'openingFloat', s.opening_float,
    'cashSales', totals.cash,
    'cardSales', totals.card,
    'totalSales', totals.total,
    'tickets', totals.tickets,
    'deposits', moves.deposits,
    'withdrawals', moves.withdrawals,
    'expectedCash', s.opening_float + totals.cash + moves.deposits - moves.withdrawals,
    'averageTicket', case when totals.tickets > 0 then round(totals.total / totals.tickets, 2) else 0 end,
    'firstTicket', (select full_number from inv order by fiscal_record_at, number limit 1),
    'lastTicket', (select full_number from inv order by fiscal_record_at desc, number desc limit 1),
    'taxes', coalesce((
      select jsonb_agg(jsonb_build_object('rate', rate, 'base', base, 'tax', tax) order by rate)
      from (
        select l.tax_rate as rate, sum(l.line_base) as base, sum(l.line_tax) as tax
        from public.invoice_lines l where l.invoice_id in (select id from inv)
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
  from s, totals, moves
$$;
grant execute on function app.cash_session_summary(uuid) to app_user;

-- Cierre con arqueo: lo esperado lo calcula la base de datos, no el cliente.
create or replace function app.close_cash_session(p_session uuid, p_counted numeric, p_detail jsonb, p_notes text)
returns public.cash_sessions
language plpgsql security definer set search_path = '' as $$
declare
  v_s       public.cash_sessions;
  v_summary jsonb;
begin
  select * into v_s from public.cash_sessions where id = p_session for update;
  if not found or not (v_s.organization_id in (select app.authorized_org_ids('pos.manage'))) then
    raise exception 'Caja no encontrada' using errcode = 'P0002';
  end if;
  if v_s.status <> 'open' then
    raise exception 'La caja ya está cerrada' using errcode = 'OM002';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Indica el efectivo contado' using errcode = 'OM002';
  end if;
  if exists (
       select 1 from public.pos_tabs
       where organization_id = v_s.organization_id and terminal_id = v_s.terminal_id and status in ('open', 'billing')
     ) then
    raise exception 'Hay cuentas abiertas en este terminal: cóbralas o anúlalas antes de cerrar' using errcode = 'OM002';
  end if;

  v_summary := app.cash_session_summary(p_session);
  update public.cash_sessions
  set status = 'closed',
      closed_at = now(),
      closed_by = app.current_user_id(),
      counted_cash = p_counted,
      count_detail = p_detail,
      expected_cash = (v_summary ->> 'expectedCash')::numeric,
      difference = p_counted - (v_summary ->> 'expectedCash')::numeric,
      report = v_summary,
      notes = coalesce(p_notes, notes)
  where id = p_session
  returning * into v_s;
  return v_s;
end
$$;
revoke all on function app.close_cash_session(uuid, numeric, jsonb, text) from public;

-- Una caja cerrada no cambia (el cierre la escribe como DEFINER).
create or replace function app.guard_cash_session() returns trigger
language plpgsql as $$
begin
  if old.status = 'closed' then
    raise exception 'La caja % está cerrada y es inmutable', old.number using errcode = 'OM001';
  end if;
  return new;
end
$$;
create trigger cash_sessions_guard before update or delete on public.cash_sessions
  for each row execute function app.guard_cash_session();

-- ---------------------------------------------------------------------
-- Funciones invocables por el backend
-- ---------------------------------------------------------------------

revoke all on function app.pos_pair_terminal(text, text) from public;
revoke all on function app.pos_terminal(text) from public;
revoke all on function app.pos_terminal_staff(text) from public;
revoke all on function app.pos_set_pin(uuid, uuid, text) from public;
revoke all on function app.pos_pin_challenge(text, uuid) from public;
revoke all on function app.pos_pin_result(text, uuid, boolean) from public;
revoke all on function app.pos_menu(uuid) from public;
revoke all on function app.pos_pin_status() from public;
revoke all on function app.pos_clear_pin(uuid, uuid) from public;
grant execute on function
  app.pos_pair_terminal(text, text), app.pos_terminal(text), app.pos_terminal_staff(text),
  app.pos_set_pin(uuid, uuid, text), app.pos_pin_challenge(text, uuid), app.pos_pin_result(text, uuid, boolean),
  app.pos_pin_status(), app.pos_clear_pin(uuid, uuid),
  app.pos_menu(uuid), app.close_cash_session(uuid, numeric, jsonb, text)
  to app_user;
