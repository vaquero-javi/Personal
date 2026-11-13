-- =====================================================================
-- Omnia · 0034 · Holding → Sociedades → Empresas
--
--   Holding   organizations.kind = 'holding'. Razón social con NIF propia de la
--             que cuelgan sociedades (organizations.parent_id).
--   Sociedad  organizations.kind = 'company'. Como hasta ahora: su NIF, sus
--             facturas, su VeriFactu. Puede colgar de un holding o ir suelta.
--   Empresa   public.establishments. Negocio o local DENTRO de una sociedad
--             (comparte NIF y facturación). Tiene sus almacenes y, con ellos, su TPV.
--
-- El aislamiento no cambia: el tenant sigue siendo la sociedad. Un holding no ve
-- los datos de sus sociedades por serlo; la vista de grupo suma lo que cada
-- persona puede ver en cada una con sus propios permisos.
-- =====================================================================

alter table public.organizations
  add column kind text not null default 'company' check (kind in ('holding', 'company'));
create index organizations_kind_idx on public.organizations (kind) where kind = 'holding';

-- Dos niveles de razón social: holding arriba, sociedades debajo. Nada más.
create or replace function app.guard_organization_tree() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'holding' and new.parent_id is not null then
    raise exception 'Un holding no puede depender de otra sociedad' using errcode = '23514';
  end if;
  if new.parent_id is not null
     and not exists (select 1 from public.organizations p where p.id = new.parent_id and p.kind = 'holding') then
    raise exception 'Una sociedad solo puede colgar de un holding' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.kind = 'company' and old.kind = 'holding'
     and exists (select 1 from public.organizations c where c.parent_id = new.id) then
    raise exception 'El holding tiene sociedades: sácalas antes de convertirlo' using errcode = 'OM002';
  end if;
  return new;
end
$$;
create trigger organizations_guard_tree
  before insert or update of parent_id, kind on public.organizations
  for each row execute function app.guard_organization_tree();

-- ¿Gestiona el usuario esta sociedad? (rol con '*', 'org.*' u 'org.manage'; no depende de la sesión pedida)
create or replace function app.manages_organization(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_organizations uo
    join public.role_permissions rp on rp.role_id = uo.role_id
    where uo.user_id = app.current_user_id() and uo.organization_id = p_org and uo.status = 'active'
      and rp.permission_code in ('*', 'org.*', 'org.manage')
  )
$$;

-- Alta de holding: misma alta que una sociedad (roles base, propietario) y tipo holding.
create or replace function app.create_holding(p_slug text, p_legal_name text, p_tax_id text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app.create_organization(p_slug, p_legal_name, p_tax_id, null);
begin
  update public.organizations set kind = 'holding' where id = v_org;
  return v_org;
end
$$;
revoke all on function app.create_holding(text, text, text) from public;
grant execute on function app.create_holding(text, text, text) to app_user;

-- Meter o sacar una sociedad de un holding: hay que gestionar las dos.
create or replace function app.set_organization_parent(p_org uuid, p_parent uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.manages_organization(p_org) then
    raise exception 'Sin permiso para gestionar esta sociedad' using errcode = '42501';
  end if;
  if p_parent is not null and not app.manages_organization(p_parent) then
    raise exception 'Sin permiso sobre el holding' using errcode = '42501';
  end if;
  update public.organizations set parent_id = p_parent where id = p_org;
end
$$;
revoke all on function app.set_organization_parent(uuid, uuid) from public;
grant execute on function app.set_organization_parent(uuid, uuid) to app_user;

-- ---------------------------------------------------------------------
-- Empresas (negocios o locales de una sociedad)
-- ---------------------------------------------------------------------

create table public.establishments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 1 and 80),
  address         jsonb not null default '{}' check (jsonb_typeof(address) = 'object'),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index establishments_name_key on public.establishments (organization_id, lower(name));
create trigger establishments_touch before update on public.establishments
  for each row execute function app.touch_updated_at();

-- Solo en sociedades: un holding no tiene locales propios.
create or replace function app.guard_establishment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.organizations o where o.id = new.organization_id and o.kind = 'holding') then
    raise exception 'Las empresas van dentro de una sociedad, no del holding' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger establishments_guard before insert or update of organization_id on public.establishments
  for each row execute function app.guard_establishment();

alter table public.establishments enable row level security;
-- Todo miembro las ve (las usan almacén, TPV y turnos); solo quien gestiona la sociedad las crea o cambia.
create policy establishments_select on public.establishments for select to app_user
  using (organization_id in (select app.active_org_ids()));
create policy establishments_insert on public.establishments for insert to app_user
  with check (organization_id in (select app.authorized_org_ids('org.manage')));
create policy establishments_update on public.establishments for update to app_user
  using (organization_id in (select app.authorized_org_ids('org.manage')))
  with check (organization_id in (select app.authorized_org_ids('org.manage')));
create policy establishments_delete on public.establishments for delete to app_user
  using (organization_id in (select app.authorized_org_ids('org.manage')));
grant select, insert, update, delete on public.establishments to app_user;

-- Cada almacén puede pertenecer a una empresa de SU sociedad (FK compuesta).
-- Borrar la empresa deja el almacén sin empresa, no lo borra.
alter table public.warehouses add column establishment_id uuid;
alter table public.warehouses
  add constraint warehouses_establishment_fk foreign key (organization_id, establishment_id)
  references public.establishments (organization_id, id) on delete set null (establishment_id);
create index warehouses_establishment_idx on public.warehouses (organization_id, establishment_id) where establishment_id is not null;

-- ---------------------------------------------------------------------
-- Membresías: ahora con el tipo (para agrupar la barra lateral por holding)
-- ---------------------------------------------------------------------

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
  features text[],
  kind text
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.slug, o.legal_name, o.trade_name, o.tax_id, o.spine_color, o.parent_id,
         r.key, r.name,
         coalesce(array_agg(rp.permission_code order by rp.permission_code) filter (where rp.permission_code is not null), '{}'),
         uo.is_default,
         array(select f from app.org_entitled_features(o.id) f order by f),
         o.kind
  from public.user_organizations uo
  join public.organizations o on o.id = uo.organization_id
  join public.roles r on r.id = uo.role_id
  left join public.role_permissions rp on rp.role_id = r.id
  where uo.user_id = app.current_user_id() and uo.status = 'active'
  group by o.id, r.id, uo.is_default, uo.created_at
  order by uo.created_at, o.legal_name
$$;
grant execute on function app.my_memberships() to app_user;
