-- =====================================================================
-- Omnia · 0042 · Store: la sociedad compra o desinstala módulos Pro
--
-- Solo los PROPIETARIOS de la sociedad (rol owner) activan o quitan por su
-- cuenta los módulos Pro: los que no vienen en el plan de entrada (default_enabled =
-- false). Lo del plan de entrada y lo que Omnia oculta no se toca desde aquí;
-- el equipo de Omnia sigue pudiendo cambiarlo todo desde el panel.
--
-- Sin pasarela de pago todavía: comprar activa el módulo al momento y queda en
-- el historial con source = 'store'. El cobro se engancha aquí más adelante.
-- =====================================================================

-- El historial admite el nuevo origen.
do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  where con.conrelid = 'public.organization_feature_events'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%source%';
  if v_name is not null then
    execute format('alter table public.organization_feature_events drop constraint %I', v_name);
  end if;
end
$$;
alter table public.organization_feature_events
  add constraint organization_feature_events_source_check
  check (source in ('signup', 'platform_admin', 'migration', 'store'));

create or replace function app.store_set_feature(p_feature text, p_install boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_requested uuid[] := app.requested_org_ids();
  v_org       uuid;
  v_actor     uuid := app.current_user_id();
  v_feature   public.features%rowtype;
  v_parent    public.features%rowtype;
begin
  -- Una única sociedad pedida, y que la persona sea propietaria activa de ella.
  if cardinality(v_requested) <> 1
     or not exists (
       select 1
       from public.user_organizations uo
       join public.roles r on r.id = uo.role_id
       where uo.user_id = v_actor and uo.organization_id = v_requested[1]
         and uo.status = 'active' and r.key = 'owner'
     ) then
    raise exception 'Solo los propietarios de la sociedad pueden comprar o quitar módulos' using errcode = '42501';
  end if;
  v_org := v_requested[1];

  select * into v_feature from public.features where code = p_feature;
  if not found or p_feature in (select app.org_hidden_features(v_org)) then
    raise exception 'Módulo desconocido' using errcode = 'P0002';
  end if;
  if v_feature.is_core or v_feature.default_enabled then
    raise exception 'Este módulo viene con tu plan: no se compra ni se quita desde la Store' using errcode = 'OM002';
  end if;

  if p_install then
    if p_feature in (select app.org_entitled_features(v_org)) then
      raise exception 'Ya lo tienes instalado' using errcode = 'OM002';
    end if;
    if v_feature.parent_code is not null
       and v_feature.parent_code not in (select app.org_entitled_features(v_org)) then
      select * into v_parent from public.features where code = v_feature.parent_code;
      raise exception 'Primero necesitas «%»', v_parent.name using errcode = 'OM002';
    end if;
  elsif not exists (
    select 1 from public.organization_features
    where organization_id = v_org and feature_code = p_feature and is_active
  ) then
    raise exception 'No lo tienes instalado' using errcode = 'OM002';
  end if;

  -- Serializa cambios simultáneos sobre la misma sociedad (también con el panel).
  perform 1 from public.organizations where id = v_org for update;

  insert into public.organization_features (organization_id, feature_code, is_active, activated_at, expires_at, updated_by)
  values (v_org, p_feature, p_install, case when p_install then now() end, null, v_actor)
  on conflict (organization_id, feature_code) do update
    set is_active    = excluded.is_active,
        activated_at = case when excluded.is_active then now() else public.organization_features.activated_at end,
        expires_at   = null,
        updated_at   = now(),
        updated_by   = v_actor;

  insert into public.organization_feature_events (organization_id, feature_code, is_active, actor_id, source)
  values (v_org, p_feature, p_install, v_actor, 'store');

  if p_install then
    -- Sus submódulos del plan de entrada vienen con él (p. ej. los informes de Estadísticas).
    insert into public.organization_features (organization_id, feature_code, is_active, activated_at, updated_by)
    select v_org, f.code, true, now(), v_actor
    from public.features f
    where f.parent_code = p_feature and f.default_enabled
    on conflict (organization_id, feature_code) do nothing;

    update public.feature_requests
    set resolved_at = now(), resolved_by = v_actor
    where organization_id = v_org and feature_code = p_feature and resolved_at is null;
  end if;
end
$$;
revoke all on function app.store_set_feature(text, boolean) from public;
grant execute on function app.store_set_feature(text, boolean) to app_user;
