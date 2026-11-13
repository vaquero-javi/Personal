-- =====================================================================
-- Omnia · 0037 · Mensajes: correo interno entre las personas de una sociedad
--
--   message_threads       conversación (asunto) dentro de una sociedad
--   message_participants  quién está en ella y su estado (leído, archivado, destacado)
--   messages              cada mensaje; inmutable (ni se edita ni se borra)
--
-- Privacidad: una conversación solo la ven sus participantes. Ningún rol (ni
-- el propietario) lee conversaciones ajenas. Todo exige el módulo «Mensajes».
-- Las escrituras van por funciones SECURITY DEFINER que validan en la base:
-- destinatarios de la misma sociedad y activos, remitente participante, etc.
-- =====================================================================

insert into public.features (code, parent_code, name, description, is_core, default_enabled, permission_gates, sort_order)
values ('messages', null, 'Mensajes', 'Correo interno entre las personas de la sociedad: conversaciones, respuestas y archivo.', false, true, '{}', 150);

-- Las sociedades que ya existen lo reciben (como el resto de módulos al migrar).
insert into public.organization_features (organization_id, feature_code, is_active, activated_at)
select o.id, 'messages', true, now() from public.organizations o
on conflict (organization_id, feature_code) do nothing;
insert into public.organization_feature_events (organization_id, feature_code, is_active, source)
select o.id, 'messages', true, 'migration' from public.organizations o;

create table public.message_threads (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subject         text not null check (char_length(trim(subject)) between 1 and 200),
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, created_by) references public.user_organizations (organization_id, user_id)
);

create table public.message_participants (
  organization_id uuid not null,
  thread_id       uuid not null,
  user_id         uuid not null,
  last_read_at    timestamptz,
  archived_at     timestamptz,
  starred         boolean not null default false,
  primary key (thread_id, user_id),
  foreign key (organization_id, thread_id) references public.message_threads (organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references public.user_organizations (organization_id, user_id)
);
create index message_participants_user_idx on public.message_participants (organization_id, user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  thread_id       uuid not null,
  sender_id       uuid not null,
  body            text not null check (char_length(trim(body)) between 1 and 20000),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, thread_id) references public.message_threads (organization_id, id) on delete cascade,
  foreign key (organization_id, sender_id) references public.user_organizations (organization_id, user_id)
);
create index messages_thread_idx on public.messages (thread_id, created_at);
create trigger messages_immutable before update or delete on public.messages
  for each row execute function app.forbid_mutation();

-- ¿Participa la persona de la sesión? (DEFINER: evita la recursión entre políticas)
create or replace function app.message_thread_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select mp.thread_id from public.message_participants mp
  where mp.user_id = app.current_user_id()
    and mp.organization_id in (select app.feature_org_ids('messages'))
$$;

-- Solo lectura desde la aplicación; las escrituras, por las funciones de abajo.
alter table public.message_threads enable row level security;
create policy message_threads_select on public.message_threads for select to app_user
  using (id in (select app.message_thread_ids()));
grant select on public.message_threads to app_user;

alter table public.message_participants enable row level security;
create policy message_participants_select on public.message_participants for select to app_user
  using (thread_id in (select app.message_thread_ids()));
grant select on public.message_participants to app_user;

alter table public.messages enable row level security;
create policy messages_select on public.messages for select to app_user
  using (thread_id in (select app.message_thread_ids()));
grant select on public.messages to app_user;

-- Sociedad única de la sesión con el módulo, y la persona miembro activo en ella.
create or replace function app.message_org() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_orgs uuid[] := array(select app.feature_org_ids('messages'));
begin
  if cardinality(app.requested_org_ids()) <> 1 or cardinality(v_orgs) <> 1 then
    raise exception 'Mensajes no está disponible en esta sociedad' using errcode = '42501';
  end if;
  return v_orgs[1];
end
$$;

-- Nueva conversación. Devuelve su id.
create or replace function app.message_send(p_subject text, p_body text, p_recipients uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org    uuid := app.message_org();
  v_me     uuid := app.current_user_id();
  v_to     uuid[] := array(select distinct r from unnest(p_recipients) r where r is not null and r <> v_me);
  v_thread uuid;
begin
  if cardinality(v_to) = 0 then
    raise exception 'Elige al menos a una persona' using errcode = '23514';
  end if;
  if cardinality(v_to) > 100 then
    raise exception 'Como mucho 100 destinatarios' using errcode = '23514';
  end if;
  -- Todos deben ser miembros activos de ESTA sociedad (si no, ni se revela quién existe).
  if exists (
    select 1 from unnest(v_to) r
    where not exists (select 1 from public.user_organizations uo
                      where uo.organization_id = v_org and uo.user_id = r and uo.status = 'active')
  ) then
    raise exception 'Algún destinatario no pertenece a esta sociedad' using errcode = '23514';
  end if;

  insert into public.message_threads (organization_id, subject, created_by)
  values (v_org, trim(p_subject), v_me) returning id into v_thread;
  insert into public.message_participants (organization_id, thread_id, user_id, last_read_at)
  select v_org, v_thread, u, case when u = v_me then now() end
  from unnest(array_append(v_to, v_me)) u;
  insert into public.messages (organization_id, thread_id, sender_id, body)
  values (v_org, v_thread, v_me, p_body);
  return v_thread;
end
$$;

-- Responder a todos. La conversación vuelve a la bandeja de entrada de todos.
create or replace function app.message_reply(p_thread uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app.message_org();
  v_me  uuid := app.current_user_id();
begin
  -- Bloquea la conversación: dos respuestas simultáneas quedan en orden.
  perform 1 from public.message_threads where id = p_thread and organization_id = v_org for update;
  if not found or not exists (select 1 from public.message_participants where thread_id = p_thread and user_id = v_me) then
    raise exception 'Conversación no encontrada' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.user_organizations where organization_id = v_org and user_id = v_me and status = 'active') then
    raise exception 'Tu acceso a esta sociedad no está activo' using errcode = '42501';
  end if;
  insert into public.messages (organization_id, thread_id, sender_id, body) values (v_org, p_thread, v_me, p_body);
  update public.message_threads set last_message_at = now() where id = p_thread;
  update public.message_participants set archived_at = null where thread_id = p_thread;
  update public.message_participants set last_read_at = now() where thread_id = p_thread and user_id = v_me;
end
$$;

-- Estado propio de una conversación: leída, archivada, destacada.
create or replace function app.message_set_state(p_thread uuid, p_read boolean, p_archived boolean, p_starred boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app.message_org();
begin
  update public.message_participants
  set last_read_at = case when p_read is null then last_read_at when p_read then now() else null end,
      archived_at  = case when p_archived is null then archived_at when p_archived then coalesce(archived_at, now()) else null end,
      starred      = coalesce(p_starred, starred)
  where thread_id = p_thread and user_id = app.current_user_id() and organization_id = v_org;
  if not found then
    raise exception 'Conversación no encontrada' using errcode = 'P0002';
  end if;
end
$$;

-- No leídas por sociedad, de todas mis sociedades (para la barra lateral).
create or replace function app.my_unread_messages()
returns table (organization_id uuid, unread integer)
language sql stable security definer set search_path = '' as $$
  select mp.organization_id, count(*)::int
  from public.message_participants mp
  join public.message_threads t on t.id = mp.thread_id
  join public.user_organizations uo on uo.organization_id = mp.organization_id and uo.user_id = mp.user_id and uo.status = 'active'
  where mp.user_id = app.current_user_id()
    and mp.archived_at is null
    and (mp.last_read_at is null or mp.last_read_at < t.last_message_at)
    and 'messages' in (select app.org_entitled_features(mp.organization_id))
  group by mp.organization_id
$$;

revoke all on function app.message_thread_ids() from public;
revoke all on function app.message_org() from public;
revoke all on function app.message_send(text, text, uuid[]) from public;
revoke all on function app.message_reply(uuid, text) from public;
revoke all on function app.message_set_state(uuid, boolean, boolean, boolean) from public;
revoke all on function app.my_unread_messages() from public;
grant execute on function app.message_thread_ids() to app_user;
grant execute on function app.message_send(text, text, uuid[]) to app_user;
grant execute on function app.message_reply(uuid, text) to app_user;
grant execute on function app.message_set_state(uuid, boolean, boolean, boolean) to app_user;
grant execute on function app.my_unread_messages() to app_user;
