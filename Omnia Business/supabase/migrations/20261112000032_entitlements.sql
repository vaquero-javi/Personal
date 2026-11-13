-- =====================================================================
-- Omnia · 0032 · Módulos contratados por sociedad (entitlements)
--
-- Tres capas, de fuera hacia dentro:
--   1. PLATAFORMA  public.features              catálogo jerárquico de módulos y submódulos
--                  public.organization_features  qué tiene activo cada sociedad (lo decide Omnia)
--   2. SOCIEDAD    roles / role_permissions     qué puede hacer cada persona dentro (lo decide el cliente)
--   3. RLS         app.authorized_org_ids()     intersección de las dos anteriores
--
-- Un permiso de rol queda «tapado» por el módulo que lo cubre (`permission_gates`):
-- si la sociedad no tiene ese módulo activo, app.authorized_org_ids() no devuelve
-- la sociedad y la RLS niega lectura y escritura, aunque el rol sea '*'. Así ni un
-- propietario puede saltarse lo contratado, ni siquiera con supabase-js directo.
--
-- Un módulo está activo (efectivo) si:
--   (is_core  O  hay fila is_active y no caducada en organization_features)
--   Y su módulo padre está activo (recursivo).
--
-- Las sociedades son los tenants (`organizations`): no hay tabla `tenants` aparte.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------

create table public.features (
  code             text primary key check (code ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)*$'),
  parent_code      text references public.features (code) on delete restrict,
  name             text not null check (char_length(name) between 1 and 80),
  description      text not null default '' check (char_length(description) <= 400),
  -- Incluido en la base: siempre activo, no se puede desactivar.
  is_core          boolean not null default false,
  -- Se activa solo al crear una sociedad (plan de entrada). Omnia lo puede quitar después.
  default_enabled  boolean not null default false,
  -- Prefijos de permisos de rol que este módulo tapa ('sales' cubre 'sales.read', 'sales.write'…).
  -- Vacío = submódulo de interfaz: se comprueba en la aplicación (requireFeature), no en la RLS.
  permission_gates text[] not null default '{}',
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  -- La jerarquía se lee en el propio código: 'sales.pos' cuelga de 'sales'.
  check (
    (parent_code is null and position('.' in code) = 0)
    or (parent_code is not null and left(code, char_length(parent_code) + 1) = parent_code || '.'
        and position('.' in substr(code, char_length(parent_code) + 2)) = 0)
  ),
  check (not (is_core and default_enabled))
);
create index features_parent_idx on public.features (parent_code) where parent_code is not null;

-- Un módulo base no puede colgar de uno de pago (sería «incluido» y a la vez inaccesible).
create or replace function app.guard_feature_core() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.is_core and new.parent_code is not null
     and not exists (select 1 from public.features p where p.code = new.parent_code and p.is_core) then
    raise exception 'El módulo base % no puede depender de un módulo de pago (%)', new.code, new.parent_code
      using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger features_guard_core before insert or update on public.features
  for each row execute function app.guard_feature_core();

-- ---------------------------------------------------------------------
-- Asignación por sociedad
-- ---------------------------------------------------------------------

create table public.organization_features (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  feature_code    text not null references public.features (code) on delete cascade,
  is_active       boolean not null default true,
  activated_at    timestamptz,
  expires_at      timestamptz,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.users (id) on delete set null,
  primary key (organization_id, feature_code),
  check (not is_active or activated_at is not null),
  check (expires_at is null or activated_at is null or expires_at > activated_at)
);
create index organization_features_feature_idx on public.organization_features (feature_code);

-- Historial inmutable de cada cambio (quién activó qué, y cuándo).
create table public.organization_feature_events (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  feature_code    text not null references public.features (code) on delete cascade,
  is_active       boolean not null,
  expires_at      timestamptz,
  actor_id        uuid references public.users (id) on delete set null,
  source          text not null check (source in ('signup', 'platform_admin', 'migration')),
  created_at      timestamptz not null default now()
);
create index organization_feature_events_org_idx on public.organization_feature_events (organization_id, created_at desc);
create trigger organization_feature_events_immutable before update or delete on public.organization_feature_events
  for each row execute function app.forbid_mutation();

-- Solicitudes de activación desde la pantalla de «módulo no contratado».
create table public.feature_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  feature_code    text not null references public.features (code) on delete cascade,
  requested_by    uuid not null references public.users (id) on delete cascade,
  message         text check (char_length(message) <= 500),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references public.users (id) on delete set null
);
create unique index feature_requests_one_pending on public.feature_requests (organization_id, feature_code)
  where resolved_at is null;
create index feature_requests_pending_idx on public.feature_requests (created_at) where resolved_at is null;

-- Propietarios de la plataforma (Omnia). Sin GRANT para app_user: solo se lee
-- desde funciones SECURITY DEFINER. No es un rol de sociedad: ser super-admin
-- no da acceso a los datos de ninguna empresa, solo a la gestión de módulos.
create table public.platform_admins (
  user_id    uuid primary key references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Resolución
-- ---------------------------------------------------------------------

create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = app.current_user_id())
$$;

-- Módulos efectivos de una sociedad. INTERNA (sin GRANT): recibe un id arbitrario,
-- así que exponerla permitiría consultar los módulos de otra empresa (IDOR).
create or replace function app.org_entitled_features(p_org uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  with recursive effective as (
    select f.code
    from public.features f
    where f.parent_code is null
      and (f.is_core or exists (
        select 1 from public.organization_features ofe
        where ofe.organization_id = p_org and ofe.feature_code = f.code
          and ofe.is_active and (ofe.expires_at is null or ofe.expires_at > now())))
    union all
    select f.code
    from public.features f
    join effective e on f.parent_code = e.code
    where f.is_core or exists (
        select 1 from public.organization_features ofe
        where ofe.organization_id = p_org and ofe.feature_code = f.code
          and ofe.is_active and (ofe.expires_at is null or ofe.expires_at > now()))
  )
  select code from effective
$$;
revoke all on function app.org_entitled_features(uuid) from public;

-- Módulo que tapa un permiso: el del prefijo más largo que coincide, o null si
-- ninguno lo cubre (miembros, roles, '*'…: siempre disponibles).
create or replace function app.permission_feature(p_permission text) returns text
language sql stable security definer set search_path = '' as $$
  select f.code
  from public.features f
  cross join lateral unnest(f.permission_gates) as g(prefix)
  where p_permission = g.prefix or starts_with(p_permission, g.prefix || '.')
  order by char_length(g.prefix) desc, f.code
  limit 1
$$;
grant execute on function app.permission_feature(text) to app_user;

-- Redefinición: los roles operan POR DEBAJO de los módulos contratados.
-- Misma firma y mismas propiedades (no correlacionada → una evaluación por consulta).
create or replace function app.authorized_org_ids(p_permission text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  with gate as (select app.permission_feature(p_permission) as code)
  select distinct uo.organization_id
  from public.user_organizations uo
  join public.role_permissions rp
    on rp.organization_id = uo.organization_id
   and rp.role_id = uo.role_id
  cross join gate
  where uo.user_id = app.current_user_id()
    and uo.status = 'active'
    and uo.organization_id = any (app.requested_org_ids())
    and rp.permission_code in ('*', split_part(p_permission, '.', 1) || '.*', p_permission)
    and (gate.code is null or gate.code in (select app.org_entitled_features(uo.organization_id)))
$$;

-- Sociedades activas de la sesión que tienen el módulo. Para las políticas
-- restrictivas de abajo (no correlacionada: una evaluación por consulta).
create or replace function app.feature_org_ids(p_feature text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select o.id
  from app.active_org_ids() as o(id)
  where p_feature in (select app.org_entitled_features(o.id))
$$;
grant execute on function app.feature_org_ids(text) to app_user;

-- Política RESTRICTIVA sobre todas las operaciones de una tabla de un módulo de pago.
-- Se suma con AND a las políticas existentes, así que también tapa los accesos
-- «a lo propio» que no pasan por authorized_org_ids (mis nóminas, mis turnos,
-- mi tarjeta). Convención: toda tabla nueva de un módulo de pago lleva su gate.
create or replace function app.apply_feature_gate(p_table regclass, p_feature text) returns void
language plpgsql set search_path = '' as $$
declare
  v_name text := (select relname from pg_class where oid = p_table);
begin
  if not exists (select 1 from public.features where code = p_feature and not is_core) then
    raise exception 'apply_feature_gate: % no es un módulo de pago', p_feature;
  end if;
  execute format(
    'create policy %I on %s as restrictive for all to app_user using (organization_id in (select app.feature_org_ids(%L))) with check (organization_id in (select app.feature_org_ids(%L)))',
    v_name || '_feature', p_table, p_feature, p_feature);
end
$$;

-- Módulos efectivos de las sociedades activas de la sesión (pedidas Y con membresía).
create or replace function app.entitled_features()
returns table (organization_id uuid, feature_code text)
language sql stable security definer set search_path = '' as $$
  select o.id, f.code
  from app.active_org_ids() as o(id)
  cross join lateral app.org_entitled_features(o.id) as f(code)
$$;
grant execute on function app.entitled_features() to app_user;

-- Catálogo público (sin datos de ninguna sociedad).
alter table public.features enable row level security;
create policy features_select on public.features for select to app_user using (true);
grant select on public.features to app_user;

-- Una sociedad ve su propia asignación (para la pantalla de «Tu plan»); nunca la escribe.
alter table public.organization_features enable row level security;
create policy organization_features_select on public.organization_features for select to app_user
  using (organization_id in (select app.active_org_ids()));
grant select on public.organization_features to app_user;

alter table public.organization_feature_events enable row level security;
alter table public.feature_requests enable row level security;
create policy feature_requests_select on public.feature_requests for select to app_user
  using (organization_id in (select app.authorized_org_ids('org.manage')));
grant select on public.feature_requests to app_user;
alter table public.platform_admins enable row level security;

-- La barra lateral y `can()` se resuelven con una sola consulta por petición:
-- se añaden los módulos efectivos a las membresías.
drop function app.my_memberships();
create function app.my_memberships()
returns table (
  organization_id uuid,
  slug text,
  legal_name text,
  trade_name text,
  tax_id text,
  spine_color text,
  parent_id uuid,
  role_key text,
  role_name text,
  permissions text[],
  is_default boolean,
  features text[]
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.slug, o.legal_name, o.trade_name, o.tax_id, o.spine_color, o.parent_id,
         r.key, r.name,
         coalesce(array_agg(rp.permission_code order by rp.permission_code) filter (where rp.permission_code is not null), '{}'),
         uo.is_default,
         array(select f from app.org_entitled_features(o.id) f order by f)
  from public.user_organizations uo
  join public.organizations o on o.id = uo.organization_id
  join public.roles r on r.id = uo.role_id
  left join public.role_permissions rp on rp.role_id = r.id
  where uo.user_id = app.current_user_id() and uo.status = 'active'
  group by o.id, r.id, uo.is_default, uo.created_at
  order by uo.created_at, o.legal_name
$$;
grant execute on function app.my_memberships() to app_user;

-- ---------------------------------------------------------------------
-- Solicitud de activación (la hace quien gestiona la sociedad)
-- ---------------------------------------------------------------------

create or replace function app.request_feature(p_feature text, p_message text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_requested uuid[] := app.requested_org_ids();
  v_org       uuid;
  v_id        uuid;
begin
  -- Una única sociedad pedida, y que la persona la gestione.
  if cardinality(v_requested) <> 1
     or not (v_requested[1] in (select app.authorized_org_ids('org.manage'))) then
    raise exception 'Solo quien gestiona la sociedad puede solicitar módulos' using errcode = '42501';
  end if;
  v_org := v_requested[1];
  if not exists (select 1 from public.features where code = p_feature and not is_core) then
    raise exception 'Módulo desconocido' using errcode = 'P0002';
  end if;
  if p_feature in (select app.org_entitled_features(v_org)) then
    raise exception 'El módulo ya está activo' using errcode = 'OM002';
  end if;

  insert into public.feature_requests (organization_id, feature_code, requested_by, message)
  values (v_org, p_feature, app.current_user_id(), nullif(trim(p_message), ''))
  on conflict (organization_id, feature_code) where resolved_at is null
  do update set message = coalesce(excluded.message, public.feature_requests.message)
  returning id into v_id;
  return v_id;
end
$$;
revoke all on function app.request_feature(text, text) from public;
grant execute on function app.request_feature(text, text) to app_user;

-- ---------------------------------------------------------------------
-- Panel de plataforma (solo platform_admins). Todas comprueban el rol dentro:
-- aunque la capa HTTP fallara, la base de datos no deja actuar a nadie más.
-- ---------------------------------------------------------------------

create or replace function app.assert_platform_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Solo el equipo de Omnia puede gestionar módulos' using errcode = '42501';
  end if;
end
$$;

create or replace function app.admin_organizations()
returns table (
  id uuid, slug text, legal_name text, trade_name text, tax_id text, created_at timestamptz,
  member_count integer, active_features text[], pending_requests integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_platform_admin();
  return query
    select o.id, o.slug, o.legal_name, o.trade_name, o.tax_id, o.created_at,
           (select count(*)::int from public.user_organizations uo where uo.organization_id = o.id and uo.status = 'active'),
           array(select f from app.org_entitled_features(o.id) f order by f),
           (select count(*)::int from public.feature_requests fr where fr.organization_id = o.id and fr.resolved_at is null)
    from public.organizations o
    order by o.legal_name;
end
$$;

create or replace function app.admin_organization_features(p_org uuid)
returns table (
  code text, parent_code text, name text, description text, is_core boolean, sort_order integer,
  is_assigned boolean, is_active boolean, is_effective boolean,
  activated_at timestamptz, expires_at timestamptz, updated_at timestamptz,
  pending_request_at timestamptz, pending_request_message text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_platform_admin();
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'Sociedad no encontrada' using errcode = 'P0002';
  end if;
  return query
    select f.code, f.parent_code, f.name, f.description, f.is_core, f.sort_order,
           ofe.organization_id is not null,
           coalesce(ofe.is_active, false),
           f.code in (select app.org_entitled_features(p_org)),
           ofe.activated_at, ofe.expires_at, ofe.updated_at,
           fr.created_at, fr.message
    from public.features f
    left join public.organization_features ofe on ofe.organization_id = p_org and ofe.feature_code = f.code
    left join public.feature_requests fr on fr.organization_id = p_org and fr.feature_code = f.code and fr.resolved_at is null
    order by f.sort_order, f.code;
end
$$;

create or replace function app.admin_set_feature(
  p_org uuid, p_feature text, p_active boolean, p_expires_at timestamptz default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := app.current_user_id();
  v_core  boolean;
begin
  perform app.assert_platform_admin();
  select is_core into v_core from public.features where code = p_feature;
  if not found then
    raise exception 'Módulo desconocido' using errcode = 'P0002';
  end if;
  if v_core then
    raise exception 'Los módulos base no se activan ni se desactivan' using errcode = 'OM002';
  end if;
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'Sociedad no encontrada' using errcode = 'P0002';
  end if;
  if p_active and p_expires_at is not null and p_expires_at <= now() then
    raise exception 'La fecha de caducidad ya ha pasado' using errcode = '23514';
  end if;

  -- Serializa cambios simultáneos sobre la misma sociedad.
  perform 1 from public.organizations where id = p_org for update;

  insert into public.organization_features (organization_id, feature_code, is_active, activated_at, expires_at, updated_by)
  values (p_org, p_feature, p_active, case when p_active then now() end, case when p_active then p_expires_at end, v_actor)
  on conflict (organization_id, feature_code) do update
    set is_active    = excluded.is_active,
        activated_at = case
                         when excluded.is_active and not public.organization_features.is_active then now()
                         when excluded.is_active then public.organization_features.activated_at
                         else public.organization_features.activated_at
                       end,
        expires_at   = excluded.expires_at,
        updated_at   = now(),
        updated_by   = v_actor;

  insert into public.organization_feature_events (organization_id, feature_code, is_active, expires_at, actor_id, source)
  values (p_org, p_feature, p_active, case when p_active then p_expires_at end, v_actor, 'platform_admin');

  if p_active then
    update public.feature_requests
    set resolved_at = now(), resolved_by = v_actor
    where organization_id = p_org and feature_code = p_feature and resolved_at is null;
  end if;
end
$$;

revoke all on function app.assert_platform_admin() from public;
revoke all on function app.admin_organizations() from public;
revoke all on function app.admin_organization_features(uuid) from public;
revoke all on function app.admin_set_feature(uuid, text, boolean, timestamptz) from public;
grant execute on function app.is_platform_admin() to app_user;
grant execute on function app.assert_platform_admin() to app_user;
grant execute on function app.admin_organizations() to app_user;
grant execute on function app.admin_organization_features(uuid) to app_user;
grant execute on function app.admin_set_feature(uuid, text, boolean, timestamptz) to app_user;

-- ---------------------------------------------------------------------
-- Alta de sociedad: módulos del plan de entrada
-- ---------------------------------------------------------------------

create or replace function app.grant_default_features() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.organization_features (organization_id, feature_code, is_active, activated_at, updated_by)
  select new.id, f.code, true, now(), app.current_user_id()
  from public.features f
  where f.default_enabled and not f.is_core;

  insert into public.organization_feature_events (organization_id, feature_code, is_active, actor_id, source)
  select new.id, f.code, true, app.current_user_id(), 'signup'
  from public.features f
  where f.default_enabled and not f.is_core;
  return new;
end
$$;
create trigger organizations_default_features after insert on public.organizations
  for each row execute function app.grant_default_features();

-- ---------------------------------------------------------------------
-- Catálogo inicial (los módulos que existen hoy en Omnia)
--
-- Base: lo que el resto necesita para funcionar (terceros, almacén y facturación
-- son tablas que usan ventas, compras y el TPV) y lo obligatorio por ley (fichajes).
-- ---------------------------------------------------------------------

insert into public.features (code, parent_code, name, description, is_core, default_enabled, permission_gates, sort_order) values
  ('base',        null, 'Base',          'Inicio, clientes y proveedores, ajustes, miembros y roles.', true, false, '{}', 10),
  ('inventory',   null, 'Almacén',       'Artículos, almacenes, albaranes y libro de stock.',           true, false, '{}', 20),
  ('invoicing',   null, 'Facturación',   'Facturas emitidas, series y registros VeriFactu.',            true, false, '{}', 30),
  ('hr',          null, 'Personal',      'Registro de jornada, vacaciones y permisos.',                 true, false, '{}', 40),
  ('tasks',       null, 'Tareas',        'Tareas asignadas al equipo.',                                 true, false, '{}', 50),
  ('incidents',   null, 'Incidencias',   'Incidencias del equipo y su seguimiento.',                    true, false, '{}', 60),

  ('sales',       null, 'Ventas',        'Pedidos de cliente B2B, entrega y facturación del pedido.',  false, true,  '{sales}', 100),
  ('purchasing',  null, 'Compras',       'Pedidos a proveedor y recepción en almacén.',                 false, true,  '{purchasing}', 200),
  ('stats',       null, 'Estadísticas',  'Cuadro de mando, cuenta de resultados e informes.',           false, false, '{stats}', 300);

insert into public.features (code, parent_code, name, description, is_core, default_enabled, permission_gates, sort_order) values
  ('sales.price_lists',            'sales',      'Tarifas',               'Tarifas de precios por cliente.',                         false, true,  '{}', 110),
  ('sales.pos',                    'sales',      'TPV de hostelería',     'Mesas, comandas, cobro, caja y escandallos en la tablet.', false, false, '{pos}', 120),
  ('purchasing.received_invoices', 'purchasing', 'Facturas recibidas',    'Registro de facturas de proveedor, también con foto.',    false, true,  '{}', 210),
  ('purchasing.price_comparison',  'purchasing', 'Comparador de precios', 'Precio de cada artículo por proveedor y evolución.',       false, false, '{}', 220),
  ('hr.shifts',                    'hr',         'Turnos',                'Cuadrante de turnos del personal.',                       false, true,  '{hr.shifts}', 410),
  ('hr.payroll',                   'hr',         'Nóminas',               'Envío de nóminas en PDF al personal.',                    false, false, '{hr.payroll}', 420);

insert into public.features (code, parent_code, name, description, is_core, default_enabled, permission_gates, sort_order) values
  ('sales.pos.staff_cards', 'sales.pos', 'Tarjetas de empleado', 'Tarjeta con QR para el descuento de empleado y fichar en el TPV.', false, false, '{staff_cards}', 130);

-- Las sociedades que ya existen conservan todo lo que tenían (nadie pierde acceso al migrar).
insert into public.organization_features (organization_id, feature_code, is_active, activated_at)
select o.id, f.code, true, now()
from public.organizations o cross join public.features f
where not f.is_core;

insert into public.organization_feature_events (organization_id, feature_code, is_active, source)
select o.id, f.code, true, 'migration'
from public.organizations o cross join public.features f
where not f.is_core;

-- ---------------------------------------------------------------------
-- Tablas de cada módulo de pago: política restrictiva (ver apply_feature_gate)
-- ---------------------------------------------------------------------

select app.apply_feature_gate('public.sales_orders', 'sales');
select app.apply_feature_gate('public.sales_order_lines', 'sales');
select app.apply_feature_gate('public.purchase_orders', 'purchasing');
select app.apply_feature_gate('public.purchase_order_lines', 'purchasing');
select app.apply_feature_gate('public.pos_terminals', 'sales.pos');
select app.apply_feature_gate('public.pos_tables', 'sales.pos');
select app.apply_feature_gate('public.pos_categories', 'sales.pos');
select app.apply_feature_gate('public.pos_tabs', 'sales.pos');
select app.apply_feature_gate('public.pos_tab_lines', 'sales.pos');
select app.apply_feature_gate('public.cash_sessions', 'sales.pos');
select app.apply_feature_gate('public.cash_movements', 'sales.pos');
select app.apply_feature_gate('public.employee_cards', 'sales.pos.staff_cards');
select app.apply_feature_gate('public.discount_redemptions', 'sales.pos.staff_cards');
select app.apply_feature_gate('public.staff_discount_policies', 'sales.pos.staff_cards');
select app.apply_feature_gate('public.shifts', 'hr.shifts');
select app.apply_feature_gate('public.payslips', 'hr.payroll');
