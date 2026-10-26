-- =====================================================================
-- Omnia · 0001 · Tenencia, usuarios, RBAC y utilidades comunes
--
-- SQL portable (PostgreSQL 15+). Nada de este fichero depende de Supabase:
-- lo específico de Supabase está en 20261025000005_supabase.sql.
--
-- Modelo de seguridad (ver docs/arquitectura.md §2):
--   * El backend se conecta con un rol LOGIN sin BYPASSRLS y en cada
--     transacción hace `SET LOCAL ROLE app_user` y fija `app.user_id` y
--     `app.org_ids` con set_config(..., true).
--   * Todas las políticas RLS se expresan sobre app.authorized_org_ids(perm),
--     que es la intersección entre las organizaciones pedidas por la sesión,
--     las membresías activas del usuario y los roles que conceden `perm`.
-- =====================================================================

create schema if not exists app;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end
$$;

grant usage on schema public, app to app_user;

-- ---------------------------------------------------------------------
-- Utilidades genéricas
-- ---------------------------------------------------------------------

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Registros con valor legal (movimientos de stock, fichajes): solo INSERT.
-- Las correcciones se registran como filas nuevas.
create or replace function app.forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% es inmutable: registra una corrección en lugar de modificar o borrar', tg_table_name
    using errcode = 'OM001';
end
$$;

-- ---------------------------------------------------------------------
-- Contexto de sesión
-- ---------------------------------------------------------------------

-- Usuario autenticado: lo fija el backend (`app.user_id`) o, si la petición
-- llega por PostgREST/Supabase, se toma del claim `sub` del JWT.
create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('app.user_id', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

-- Organizaciones que la sesión pide operar. Una para trabajo normal, varias
-- para vistas consolidadas de grupo. Fuente: `app.org_ids` (literal de array
-- '{uuid,uuid}') o la cabecera `x-organization-id` vía PostgREST.
-- Esto es lo que se PIDE; lo que se CONCEDE lo decide authorized_org_ids().
create or replace function app.requested_org_ids() returns uuid[]
language sql stable as $$
  select coalesce(
    nullif(current_setting('app.org_ids', true), '')::uuid[],
    string_to_array(
      nullif(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-organization-id', ''),
      ','
    )::uuid[],
    '{}'::uuid[]
  )
$$;

-- ---------------------------------------------------------------------
-- Organizaciones y usuarios
-- ---------------------------------------------------------------------

create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references public.organizations (id) on delete restrict,  -- holding / grupo
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  legal_name    text not null,
  trade_name    text,
  tax_id        text not null,                                    -- NIF / CIF
  country_code  char(2) not null default 'ES',
  fiscal_regime text not null default 'verifactu'
                check (fiscal_regime in ('verifactu', 'ticketbai_araba', 'ticketbai_bizkaia',
                                         'ticketbai_gipuzkoa', 'sii', 'none')),
  base_currency char(3) not null default 'EUR',
  settings      jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (parent_id is distinct from id)
);
-- Sin UNIQUE global sobre tax_id: revelaría a un tenant que otro ya existe.
create index organizations_tax_id_idx on public.organizations (country_code, tax_id);
create index organizations_parent_idx on public.organizations (parent_id) where parent_id is not null;

-- Perfil de aplicación. `id` = `sub` del proveedor de identidad
-- (auth.users.id en Supabase; Cognito/Entra/Keycloak en enterprise).
create table public.users (
  id         uuid primary key,
  email      text not null,
  full_name  text,
  locale     text not null default 'es-ES',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_key on public.users (lower(email));

-- ---------------------------------------------------------------------
-- RBAC
-- ---------------------------------------------------------------------

-- Catálogo global de permisos. Comodines: '*' (todo) y '<módulo>.*'.
create table public.permissions (
  code        text primary key check (code ~ '^(\*|[a-z_]+(\.[a-z_]+)*(\.\*)?)$'),
  module      text not null,
  description text not null
);

create table public.roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key             text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name            text not null,
  is_system       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, key),
  unique (organization_id, id)
);

create table public.role_permissions (
  organization_id uuid not null,
  role_id         uuid not null,
  permission_code text not null references public.permissions (code) on delete cascade,
  primary key (role_id, permission_code),
  foreign key (organization_id, role_id) references public.roles (organization_id, id) on delete cascade
);

create table public.user_organizations (
  user_id         uuid not null references public.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role_id         uuid not null,
  status          text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  employee_code   text,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, organization_id),
  unique (organization_id, user_id),                 -- destino de FKs compuestas (fichajes, incidencias)
  foreign key (organization_id, role_id) references public.roles (organization_id, id)
);
create unique index user_organizations_one_default on public.user_organizations (user_id) where is_default;

-- ---------------------------------------------------------------------
-- Funciones de autorización (SECURITY DEFINER: leen membresías sin pasar
-- por RLS y así evitan la recursión entre políticas)
-- ---------------------------------------------------------------------

-- Todas las membresías activas (para el selector de empresa).
create or replace function app.member_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select uo.organization_id
  from public.user_organizations uo
  where uo.user_id = app.current_user_id()
    and uo.status = 'active'
$$;

-- Organizaciones pedidas en las que el usuario es miembro activo.
create or replace function app.active_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select uo.organization_id
  from public.user_organizations uo
  where uo.user_id = app.current_user_id()
    and uo.status = 'active'
    and uo.organization_id = any (app.requested_org_ids())
$$;

-- Organizaciones pedidas en las que el rol del usuario concede `p_permission`.
-- Las políticas lo usan como `organization_id in (select app.authorized_org_ids('x'))`:
-- al no estar correlacionada, Postgres evalúa la función una sola vez por consulta
-- (subplan hasheado / semi-join) y no una vez por fila.
create or replace function app.authorized_org_ids(p_permission text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct uo.organization_id
  from public.user_organizations uo
  join public.role_permissions rp
    on rp.organization_id = uo.organization_id
   and rp.role_id = uo.role_id
  where uo.user_id = app.current_user_id()
    and uo.status = 'active'
    and uo.organization_id = any (app.requested_org_ids())
    and rp.permission_code in ('*', split_part(p_permission, '.', 1) || '.*', p_permission)
$$;

create or replace function app.has_permission(p_org uuid, p_permission text) returns boolean
language sql stable as $$
  select p_org in (select app.authorized_org_ids(p_permission))
$$;

-- Genera las cuatro políticas estándar de una tabla de negocio:
--   SELECT → '<módulo>.read' · INSERT/UPDATE → '<módulo>.write' · DELETE → '<módulo>.delete'
-- p_append_only = true omite UPDATE/DELETE (y sus GRANT).
create or replace function app.apply_tenant_policies(p_table regclass, p_module text, p_append_only boolean default false)
returns void
language plpgsql as $$
declare
  v_name text := (select relname from pg_class where oid = p_table);
begin
  execute format('alter table %s enable row level security', p_table);

  execute format(
    'create policy %I on %s for select to app_user using (organization_id in (select app.authorized_org_ids(%L)))',
    v_name || '_select', p_table, p_module || '.read');
  execute format(
    'create policy %I on %s for insert to app_user with check (organization_id in (select app.authorized_org_ids(%L)))',
    v_name || '_insert', p_table, p_module || '.write');

  if p_append_only then
    execute format('grant select, insert on %s to app_user', p_table);
    return;
  end if;

  execute format(
    'create policy %I on %s for update to app_user using (organization_id in (select app.authorized_org_ids(%L))) with check (organization_id in (select app.authorized_org_ids(%L)))',
    v_name || '_update', p_table, p_module || '.write', p_module || '.write');
  execute format(
    'create policy %I on %s for delete to app_user using (organization_id in (select app.authorized_org_ids(%L)))',
    v_name || '_delete', p_table, p_module || '.delete');
  execute format('grant select, insert, update, delete on %s to app_user', p_table);
end
$$;

-- ---------------------------------------------------------------------
-- RLS de las tablas de tenencia
-- ---------------------------------------------------------------------

alter table public.organizations enable row level security;
create policy organizations_select on public.organizations for select to app_user
  using (id in (select app.member_org_ids()));
create policy organizations_update on public.organizations for update to app_user
  using (id in (select app.authorized_org_ids('org.manage')))
  with check (id in (select app.authorized_org_ids('org.manage')));
-- INSERT solo a través de app.create_organization(); DELETE no se expone.
grant select, update (legal_name, trade_name, tax_id, fiscal_regime, settings) on public.organizations to app_user;

alter table public.users enable row level security;
create policy users_select on public.users for select to app_user
  using (
    id = (select app.current_user_id())
    or exists (
      select 1 from public.user_organizations uo
      where uo.user_id = users.id
        and uo.organization_id in (select app.active_org_ids())
    )
  );
create policy users_update_self on public.users for update to app_user
  using (id = (select app.current_user_id()))
  with check (id = (select app.current_user_id()));
grant select, update (full_name, locale) on public.users to app_user;

alter table public.permissions enable row level security;
create policy permissions_select on public.permissions for select to app_user using (true);
grant select on public.permissions to app_user;

alter table public.roles enable row level security;
create policy roles_select on public.roles for select to app_user
  using (organization_id in (select app.active_org_ids()));
create policy roles_write on public.roles for all to app_user
  using (organization_id in (select app.authorized_org_ids('roles.manage')) and not is_system)
  with check (organization_id in (select app.authorized_org_ids('roles.manage')) and not is_system);
grant select, insert, update, delete on public.roles to app_user;

alter table public.role_permissions enable row level security;
create policy role_permissions_select on public.role_permissions for select to app_user
  using (organization_id in (select app.active_org_ids()));
-- '*' solo se concede al crear la organización, y los roles de sistema no se
-- tocan: así 'roles.manage' no sirve para escalar privilegios.
create policy role_permissions_write on public.role_permissions for all to app_user
  using (
    organization_id in (select app.authorized_org_ids('roles.manage'))
    and not exists (select 1 from public.roles r where r.id = role_id and r.is_system)
  )
  with check (
    organization_id in (select app.authorized_org_ids('roles.manage'))
    and permission_code <> '*'
    and not exists (select 1 from public.roles r where r.id = role_id and r.is_system)
  );
grant select, insert, delete on public.role_permissions to app_user;

alter table public.user_organizations enable row level security;
create policy user_organizations_select on public.user_organizations for select to app_user
  using (
    user_id = (select app.current_user_id())
    or organization_id in (select app.active_org_ids())
  );
create policy user_organizations_write on public.user_organizations for all to app_user
  using (organization_id in (select app.authorized_org_ids('members.manage')))
  with check (organization_id in (select app.authorized_org_ids('members.manage')));
grant select, insert, update, delete on public.user_organizations to app_user;

-- Un gestor de miembros no puede asignar el rol de propietario: eso exige '*'.
-- SECURITY INVOKER a propósito: `current_user` debe ser el rol de la sesión.
-- Las altas internas (app.create_organization, que es DEFINER) quedan fuera.
create or replace function app.guard_membership_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
       select 1 from public.role_permissions rp
       where rp.role_id = new.role_id and rp.permission_code = '*'
     )
     and not app.has_permission(new.organization_id, '*')
     and current_user = 'app_user' then
    raise exception 'Solo un propietario puede conceder el rol de propietario' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger user_organizations_guard_role
  before insert or update of role_id on public.user_organizations
  for each row execute function app.guard_membership_role();

create trigger organizations_touch before update on public.organizations for each row execute function app.touch_updated_at();
create trigger users_touch before update on public.users for each row execute function app.touch_updated_at();
create trigger roles_touch before update on public.roles for each row execute function app.touch_updated_at();
create trigger user_organizations_touch before update on public.user_organizations for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------
-- Alta de organización (crea roles base y hace propietario al usuario)
-- ---------------------------------------------------------------------

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

  -- Colgar una sociedad de un holding exige gestionar el holding.
  if p_parent_id is not null and not exists (
       select 1
       from public.user_organizations uo
       join public.role_permissions rp on rp.role_id = uo.role_id
       where uo.user_id = v_user and uo.organization_id = p_parent_id and uo.status = 'active'
         and rp.permission_code in ('*', 'org.*', 'org.manage')
     ) then
    raise exception 'Sin permiso sobre la organización matriz' using errcode = '42501';
  end if;

  insert into public.organizations (slug, legal_name, tax_id, parent_id)
  values (p_slug, p_legal_name, p_tax_id, p_parent_id)
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
    'hr.*', 'incidents.*', 'audit.read'
  ]) p
  union all
  select v_org, v_employee, p from unnest(array[
    'members.read', 'hr.time.self', 'hr.leave.request', 'incidents.read', 'incidents.write', 'inventory.read'
  ]) p;

  insert into public.user_organizations (user_id, organization_id, role_id, is_default)
  values (
    v_user, v_org, v_owner,
    not exists (select 1 from public.user_organizations where user_id = v_user and is_default)
  );

  return v_org;
end
$$;
revoke all on function app.create_organization(text, text, text, uuid) from public;
grant execute on function app.create_organization(text, text, text, uuid) to app_user;

-- ---------------------------------------------------------------------
-- Numeración correlativa sin huecos por organización y ámbito
-- (albaranes, incidencias, ...). Las facturas usan invoice_series.
-- ---------------------------------------------------------------------

create table public.document_sequences (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scope           text not null,
  next_value      bigint not null default 1 check (next_value > 0),
  primary key (organization_id, scope)
);
alter table public.document_sequences enable row level security;  -- sin políticas: solo vía función

create or replace function app.next_document_number(p_org uuid, p_scope text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_value bigint;
begin
  if not (p_org in (select app.active_org_ids())) then
    raise exception 'Organización fuera del contexto activo' using errcode = '42501';
  end if;
  -- El UPDATE bloquea la fila hasta el COMMIT: dos altas concurrentes se
  -- serializan y un ROLLBACK devuelve el número (sin huecos).
  insert into public.document_sequences as ds (organization_id, scope, next_value)
  values (p_org, p_scope, 2)
  on conflict (organization_id, scope) do update set next_value = ds.next_value + 1
  returning ds.next_value - 1 into v_value;
  return v_value;
end
$$;

-- Trigger genérico: rellena NEW.number. Argumento: ámbito de la secuencia.
create or replace function app.assign_document_number() returns trigger
language plpgsql as $$
begin
  if new.number is null then
    new.number := app.next_document_number(new.organization_id, tg_argv[0]);
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------
-- Campos dinámicos (JSONB) parametrizables por empresa
-- Las columnas `custom_fields jsonb` de cada entidad se validan contra estas
-- definiciones en la capa de aplicación (Zod generado en runtime).
-- ---------------------------------------------------------------------

create table public.custom_field_definitions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity          text not null check (entity in ('inventory_item', 'party', 'invoice', 'goods_receipt',
                                                  'incident', 'time_entry')),
  key             text not null check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  label           text not null,
  data_type       text not null check (data_type in ('text', 'number', 'boolean', 'date', 'select', 'multiselect')),
  is_required     boolean not null default false,
  options         jsonb not null default '[]' check (jsonb_typeof(options) = 'array'),
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, entity, key)
);
alter table public.custom_field_definitions enable row level security;
create policy custom_field_definitions_select on public.custom_field_definitions for select to app_user
  using (organization_id in (select app.active_org_ids()));
create policy custom_field_definitions_write on public.custom_field_definitions for all to app_user
  using (organization_id in (select app.authorized_org_ids('org.manage')))
  with check (organization_id in (select app.authorized_org_ids('org.manage')));
grant select, insert, update, delete on public.custom_field_definitions to app_user;
create trigger custom_field_definitions_touch before update on public.custom_field_definitions
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------
-- Auditoría (trazabilidad de cambios)
-- ---------------------------------------------------------------------

create table public.audit_log (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  table_name      text not null,
  row_id          uuid,
  action          text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id        uuid,
  old_data        jsonb,
  new_data        jsonb,
  created_at      timestamptz not null default now()
);
create index audit_log_lookup_idx on public.audit_log (organization_id, table_name, row_id, created_at desc);

alter table public.audit_log enable row level security;
create policy audit_log_select on public.audit_log for select to app_user
  using (organization_id in (select app.authorized_org_ids('audit.read')));
grant select on public.audit_log to app_user;

create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb;
begin
  if tg_op = 'DELETE' then v_row := to_jsonb(old); else v_row := to_jsonb(new); end if;
  insert into public.audit_log (organization_id, table_name, row_id, action, actor_id, old_data, new_data)
  values (
    (v_row ->> 'organization_id')::uuid,
    tg_table_name,
    (v_row ->> 'id')::uuid,
    tg_op,
    app.current_user_id(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end
$$;

create trigger user_organizations_audit after insert or update or delete on public.user_organizations
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------
-- Catálogo de permisos
-- ---------------------------------------------------------------------

insert into public.permissions (code, module, description) values
  ('*',                 'core',      'Acceso total (propietario)'),
  ('org.*',             'org',       'Todo sobre la organización'),
  ('org.manage',        'org',       'Editar datos fiscales, ajustes y campos dinámicos'),
  ('members.*',         'members',   'Todo sobre miembros'),
  ('members.read',      'members',   'Ver miembros'),
  ('members.manage',    'members',   'Invitar, suspender y cambiar roles'),
  ('roles.*',           'roles',     'Todo sobre roles'),
  ('roles.manage',      'roles',     'Crear y editar roles'),
  ('audit.read',        'audit',     'Consultar el registro de auditoría'),
  ('parties.*',         'parties',   'Todo sobre clientes y proveedores'),
  ('parties.read',      'parties',   'Ver clientes y proveedores'),
  ('parties.write',     'parties',   'Crear y editar clientes y proveedores'),
  ('parties.delete',    'parties',   'Borrar clientes y proveedores'),
  ('inventory.*',       'inventory', 'Todo sobre almacén'),
  ('inventory.read',    'inventory', 'Ver artículos, stock y movimientos'),
  ('inventory.write',   'inventory', 'Crear y editar artículos, almacenes y albaranes en borrador'),
  ('inventory.delete',  'inventory', 'Borrar artículos y borradores'),
  ('inventory.post',    'inventory', 'Contabilizar movimientos de stock (albaranes, ajustes)'),
  ('invoicing.*',       'invoicing', 'Todo sobre facturación'),
  ('invoicing.read',    'invoicing', 'Ver facturas y cobros'),
  ('invoicing.write',   'invoicing', 'Crear borradores y registrar cobros/pagos'),
  ('invoicing.delete',  'invoicing', 'Borrar borradores'),
  ('invoicing.issue',   'invoicing', 'Emitir facturas (numeración y huella fiscal)'),
  ('hr.*',              'hr',        'Todo sobre RRHH'),
  ('hr.time.self',      'hr',        'Fichar uno mismo'),
  ('hr.time.read',      'hr',        'Ver fichajes de todo el personal'),
  ('hr.time.manage',    'hr',        'Registrar fichajes manuales y correcciones'),
  ('hr.leave.request',  'hr',        'Solicitar vacaciones y permisos'),
  ('hr.leave.approve',  'hr',        'Aprobar vacaciones y permisos'),
  ('incidents.*',       'incidents', 'Todo sobre incidencias'),
  ('incidents.read',    'incidents', 'Ver todas las incidencias'),
  ('incidents.write',   'incidents', 'Abrir incidencias y trabajar las asignadas'),
  ('incidents.manage',  'incidents', 'Asignar, cerrar y borrar cualquier incidencia');
