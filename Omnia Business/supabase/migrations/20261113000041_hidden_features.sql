-- =====================================================================
-- Omnia · 0041 · Módulos ocultos por sociedad
--
-- Además de dar o quitar un módulo, el equipo de Omnia decide qué ve la
-- sociedad cuando NO lo tiene:
--   * visible (por defecto): aparece con candado «Pro» y quien gestiona la
--     sociedad puede pedirlo;
--   * oculto: no aparece en ningún sitio y no se puede pedir.
-- Un módulo activo se ve siempre: ocultar solo afecta a lo que no se tiene.
-- Ocultar un módulo oculta también sus submódulos.
-- =====================================================================

create table public.organization_hidden_features (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  feature_code    text not null references public.features (code) on delete cascade,
  hidden_at       timestamptz not null default now(),
  hidden_by       uuid references public.users (id) on delete set null,
  primary key (organization_id, feature_code)
);
create index organization_hidden_features_feature_idx on public.organization_hidden_features (feature_code);

-- Sin GRANT: solo se lee y se escribe por las funciones de abajo.
alter table public.organization_hidden_features enable row level security;

-- Ocultos de una sociedad, con sus submódulos. INTERNA (recibe un id arbitrario).
create or replace function app.org_hidden_features(p_org uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select f.code
  from public.features f
  where exists (
    select 1 from public.organization_hidden_features h
    where h.organization_id = p_org
      and (f.code = h.feature_code or starts_with(f.code, h.feature_code || '.'))
  )
$$;
revoke all on function app.org_hidden_features(uuid) from public;

-- Ocultos de todas mis sociedades (barra lateral), sin sociedad activa.
create or replace function app.my_hidden_features()
returns table (organization_id uuid, feature_code text)
language sql stable security definer set search_path = '' as $$
  select uo.organization_id, h.code
  from public.user_organizations uo
  cross join lateral app.org_hidden_features(uo.organization_id) as h(code)
  where uo.user_id = app.current_user_id() and uo.status = 'active'
$$;
revoke all on function app.my_hidden_features() from public;
grant execute on function app.my_hidden_features() to app_user;

-- Lo oculto no se puede pedir (para la sociedad no existe).
create or replace function app.request_feature(p_feature text, p_message text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_requested uuid[] := app.requested_org_ids();
  v_org       uuid;
  v_id        uuid;
begin
  if cardinality(v_requested) <> 1
     or not (v_requested[1] in (select app.authorized_org_ids('org.manage'))) then
    raise exception 'Solo quien gestiona la sociedad puede solicitar módulos' using errcode = '42501';
  end if;
  v_org := v_requested[1];
  if not exists (select 1 from public.features where code = p_feature and not is_core)
     or p_feature in (select app.org_hidden_features(v_org)) then
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

-- Panel: la matriz trae también si cada módulo está oculto (él mismo o por su padre).
drop function app.admin_organization_features(uuid);
create function app.admin_organization_features(p_org uuid)
returns table (
  code text, parent_code text, name text, description text, is_core boolean, sort_order integer,
  is_assigned boolean, is_active boolean, is_effective boolean,
  activated_at timestamptz, expires_at timestamptz, updated_at timestamptz,
  pending_request_at timestamptz, pending_request_message text,
  is_hidden boolean, hidden_by_parent boolean
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
           fr.created_at, fr.message,
           exists (select 1 from public.organization_hidden_features h where h.organization_id = p_org and h.feature_code = f.code),
           exists (select 1 from public.organization_hidden_features h
                   where h.organization_id = p_org and starts_with(f.code, h.feature_code || '.'))
    from public.features f
    left join public.organization_features ofe on ofe.organization_id = p_org and ofe.feature_code = f.code
    left join public.feature_requests fr on fr.organization_id = p_org and fr.feature_code = f.code and fr.resolved_at is null
    order by f.sort_order, f.code;
end
$$;
revoke all on function app.admin_organization_features(uuid) from public;
grant execute on function app.admin_organization_features(uuid) to app_user;

create or replace function app.admin_set_feature_hidden(p_org uuid, p_feature text, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_platform_admin();
  if not exists (select 1 from public.features where code = p_feature) then
    raise exception 'Módulo desconocido' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'Sociedad no encontrada' using errcode = 'P0002';
  end if;
  if p_hidden then
    insert into public.organization_hidden_features (organization_id, feature_code, hidden_by)
    values (p_org, p_feature, app.current_user_id())
    on conflict (organization_id, feature_code) do nothing;
    -- Lo que estaba pedido deja de estarlo: la sociedad ya no lo ve.
    update public.feature_requests
    set resolved_at = now(), resolved_by = app.current_user_id()
    where organization_id = p_org and resolved_at is null
      and (feature_code = p_feature or starts_with(feature_code, p_feature || '.'));
  else
    delete from public.organization_hidden_features where organization_id = p_org and feature_code = p_feature;
  end if;
end
$$;
revoke all on function app.admin_set_feature_hidden(uuid, text, boolean) from public;
grant execute on function app.admin_set_feature_hidden(uuid, text, boolean) to app_user;
