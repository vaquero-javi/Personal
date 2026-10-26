-- =====================================================================
-- Omnia · 0006 · Compras, ventas (B2B y TPV), turnos y comentarios
-- SQL portable (PostgreSQL 15+).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Identidad visual de la sociedad: el color de su lomo en la estantería
-- ---------------------------------------------------------------------

alter table public.organizations
  add column spine_color text not null default 'red'
  check (spine_color in ('red', 'blue', 'yellow', 'green'));
grant update (spine_color) on public.organizations to app_user;

-- ---------------------------------------------------------------------
-- Permisos nuevos
-- ---------------------------------------------------------------------

insert into public.permissions (code, module, description) values
  ('purchasing.*',      'purchasing', 'Todo sobre compras'),
  ('purchasing.read',   'purchasing', 'Ver pedidos de compra'),
  ('purchasing.write',  'purchasing', 'Crear y editar pedidos de compra'),
  ('purchasing.delete', 'purchasing', 'Borrar pedidos en borrador'),
  ('sales.*',           'sales',      'Todo sobre ventas'),
  ('sales.read',        'sales',      'Ver pedidos de venta y tickets'),
  ('sales.write',       'sales',      'Crear pedidos de venta y cobrar en TPV'),
  ('sales.delete',      'sales',      'Borrar pedidos en borrador'),
  ('hr.shifts.manage',  'hr',         'Planificar turnos');

-- Las plantillas de rol incluyen los módulos nuevos.
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
    -- Siguiente color de la estantería del usuario.
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

  insert into public.user_organizations (user_id, organization_id, role_id, is_default)
  values (
    v_user, v_org, v_owner,
    not exists (select 1 from public.user_organizations where user_id = v_user and is_default)
  );

  return v_org;
end
$$;

-- ---------------------------------------------------------------------
-- Compras: pedidos a proveedor
-- ---------------------------------------------------------------------

create table public.purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  number          bigint,
  supplier_id     uuid not null,
  warehouse_id    uuid not null,
  status          text not null default 'draft'
                  check (status in ('draft', 'sent', 'partially_received', 'received', 'cancelled')),
  order_date      date not null default current_date,
  expected_on     date,
  notes           text,
  created_by      uuid references public.users (id) default app.current_user_id(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  foreign key (organization_id, supplier_id) references public.parties (organization_id, id),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id),
  check (expected_on is null or expected_on >= order_date)
);
create index purchase_orders_status_idx on public.purchase_orders (organization_id, status, order_date desc);

create table public.purchase_order_lines (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  purchase_order_id uuid not null,
  line_no           integer not null check (line_no > 0),
  item_id           uuid not null,
  quantity          numeric(18, 4) not null check (quantity > 0),
  unit_cost         numeric(18, 6) not null check (unit_cost >= 0),
  received_quantity numeric(18, 4) not null default 0 check (received_quantity >= 0),
  unique (purchase_order_id, line_no),
  unique (organization_id, id),
  foreign key (organization_id, purchase_order_id) references public.purchase_orders (organization_id, id) on delete cascade,
  foreign key (organization_id, item_id) references public.inventory_items (organization_id, id)
);

-- El albarán puede venir de un pedido; cada línea, de una línea del pedido.
alter table public.goods_receipts add column purchase_order_id uuid;
alter table public.goods_receipts
  add foreign key (organization_id, purchase_order_id) references public.purchase_orders (organization_id, id);
alter table public.goods_receipt_lines add column purchase_order_line_id uuid;
alter table public.goods_receipt_lines
  add foreign key (organization_id, purchase_order_line_id) references public.purchase_order_lines (organization_id, id);

-- Al contabilizar un albarán ligado a un pedido, se acumula lo recibido y se
-- recalcula el estado del pedido, en la misma transacción.
create or replace function app.sync_purchase_order_on_post() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'posted' and old.status = 'draft' and new.purchase_order_id is not null then
    update public.purchase_order_lines pol
    set received_quantity = pol.received_quantity + grl.quantity
    from public.goods_receipt_lines grl
    where grl.receipt_id = new.id
      and grl.purchase_order_line_id = pol.id;

    update public.purchase_orders po
    set status = case
          when not exists (
            select 1 from public.purchase_order_lines l
            where l.purchase_order_id = po.id and l.received_quantity < l.quantity
          ) then 'received'
          else 'partially_received'
        end,
        updated_at = now()
    where po.id = new.purchase_order_id and po.status in ('sent', 'partially_received');
  end if;
  return null;
end
$$;
create trigger goods_receipts_sync_po after update of status on public.goods_receipts
  for each row execute function app.sync_purchase_order_on_post();

create or replace function app.guard_purchase_order_line() returns trigger
language plpgsql as $$
declare
  v_status text;
begin
  select status into v_status from public.purchase_orders
  where organization_id = coalesce(new.organization_id, old.organization_id)
    and id = coalesce(new.purchase_order_id, old.purchase_order_id);
  -- received_quantity la mantiene el trigger de albaranes (SECURITY DEFINER).
  if v_status is not null and v_status <> 'draft' and current_user = 'app_user' then
    raise exception 'Solo se editan líneas de pedidos en borrador' using errcode = 'OM001';
  end if;
  return coalesce(new, old);
end
$$;

create trigger purchase_orders_number before insert on public.purchase_orders
  for each row execute function app.assign_document_number('purchase_order');
create trigger purchase_orders_touch before update on public.purchase_orders
  for each row execute function app.touch_updated_at();
create trigger purchase_orders_audit after insert or update or delete on public.purchase_orders
  for each row execute function app.audit_row();
create trigger purchase_order_lines_guard before insert or update or delete on public.purchase_order_lines
  for each row execute function app.guard_purchase_order_line();

select app.apply_tenant_policies('public.purchase_orders', 'purchasing');
select app.apply_tenant_policies('public.purchase_order_lines', 'purchasing');

-- ---------------------------------------------------------------------
-- Ventas B2B: pedidos de cliente
-- ---------------------------------------------------------------------

create table public.sales_orders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  number          bigint,
  customer_id     uuid not null,
  warehouse_id    uuid not null,
  price_list_id   uuid,
  status          text not null default 'draft'
                  check (status in ('draft', 'confirmed', 'delivered', 'invoiced', 'cancelled')),
  order_date      date not null default current_date,
  delivered_at    timestamptz,
  invoice_id      uuid,
  notes           text,
  created_by      uuid references public.users (id) default app.current_user_id(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  foreign key (organization_id, customer_id) references public.parties (organization_id, id),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id),
  foreign key (organization_id, price_list_id) references public.price_lists (organization_id, id),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id),
  check ((status in ('delivered', 'invoiced')) = (delivered_at is not null)),
  check ((status = 'invoiced') = (invoice_id is not null))
);
create index sales_orders_status_idx on public.sales_orders (organization_id, status, order_date desc);

create table public.sales_order_lines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sales_order_id  uuid not null,
  line_no         integer not null check (line_no > 0),
  item_id         uuid not null,
  description     text not null,
  quantity        numeric(18, 4) not null check (quantity > 0),
  unit_price      numeric(18, 4) not null check (unit_price >= 0),
  discount_pct    numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  tax_rate        numeric(5, 2) not null check (tax_rate >= 0),
  unique (sales_order_id, line_no),
  unique (organization_id, id),
  foreign key (organization_id, sales_order_id) references public.sales_orders (organization_id, id) on delete cascade,
  foreign key (organization_id, item_id) references public.inventory_items (organization_id, id)
);

create or replace function app.guard_sales_order_line() returns trigger
language plpgsql as $$
declare
  v_status text;
begin
  select status into v_status from public.sales_orders
  where organization_id = coalesce(new.organization_id, old.organization_id)
    and id = coalesce(new.sales_order_id, old.sales_order_id);
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Solo se editan líneas de pedidos en borrador' using errcode = 'OM001';
  end if;
  return coalesce(new, old);
end
$$;

create trigger sales_orders_number before insert on public.sales_orders
  for each row execute function app.assign_document_number('sales_order');
create trigger sales_orders_touch before update on public.sales_orders
  for each row execute function app.touch_updated_at();
create trigger sales_orders_audit after insert or update or delete on public.sales_orders
  for each row execute function app.audit_row();
create trigger sales_order_lines_guard before insert or update or delete on public.sales_order_lines
  for each row execute function app.guard_sales_order_line();

select app.apply_tenant_policies('public.sales_orders', 'sales');
select app.apply_tenant_policies('public.sales_order_lines', 'sales');

-- ---------------------------------------------------------------------
-- TPV: los tickets son facturas simplificadas (F2) sin destinatario
-- ---------------------------------------------------------------------

alter table public.invoices alter column party_id drop not null;
alter table public.invoices add constraint invoices_party_required
  check (party_id is not null or invoice_type = 'F2');

-- ---------------------------------------------------------------------
-- Turnos
-- ---------------------------------------------------------------------

create table public.shifts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id         uuid not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  area            text,
  notes           text,
  created_by      uuid references public.users (id) default app.current_user_id(),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, user_id) references public.user_organizations (organization_id, user_id),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '16 hours')
);
create index shifts_user_idx on public.shifts (organization_id, user_id, starts_at);
create index shifts_day_idx on public.shifts (organization_id, starts_at);

alter table public.shifts enable row level security;
create policy shifts_select on public.shifts for select to app_user
  using (
    (user_id = (select app.current_user_id()) and organization_id in (select app.active_org_ids()))
    or organization_id in (select app.authorized_org_ids('hr.time.read'))
    or organization_id in (select app.authorized_org_ids('hr.shifts.manage'))
  );
create policy shifts_write on public.shifts for all to app_user
  using (organization_id in (select app.authorized_org_ids('hr.shifts.manage')))
  with check (organization_id in (select app.authorized_org_ids('hr.shifts.manage')));
grant select, insert, update, delete on public.shifts to app_user;

-- ---------------------------------------------------------------------
-- Comentarios de incidencias
-- ---------------------------------------------------------------------

create table public.incident_comments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  incident_id     uuid not null,
  author_id       uuid not null references public.users (id) default app.current_user_id(),
  body            text not null check (char_length(body) between 1 and 5000),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, incident_id) references public.incidents (organization_id, id) on delete cascade
);
create index incident_comments_incident_idx on public.incident_comments (organization_id, incident_id, created_at);

create trigger incident_comments_immutable before update on public.incident_comments
  for each row execute function app.forbid_mutation();

alter table public.incident_comments enable row level security;
-- Quien ve la incidencia ve sus comentarios (la subconsulta pasa por la RLS de incidents).
create policy incident_comments_select on public.incident_comments for select to app_user
  using (exists (select 1 from public.incidents i where i.organization_id = incident_comments.organization_id and i.id = incident_comments.incident_id));
create policy incident_comments_insert on public.incident_comments for insert to app_user
  with check (
    author_id = (select app.current_user_id())
    and organization_id in (select app.authorized_org_ids('incidents.write'))
    and exists (select 1 from public.incidents i where i.organization_id = incident_comments.organization_id and i.id = incident_comments.incident_id)
  );
grant select, insert on public.incident_comments to app_user;

-- ---------------------------------------------------------------------
-- Facturas recibidas: registrar (borrador → issued) con totales de líneas
-- La política restrictiva de invoices impide marcar `issued` por UPDATE directo.
-- ---------------------------------------------------------------------

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
revoke all on function app.register_received_invoice(uuid) from public;
grant execute on function app.register_received_invoice(uuid) to app_user;
