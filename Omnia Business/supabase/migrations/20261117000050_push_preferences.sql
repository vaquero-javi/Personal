-- =====================================================================
-- Omnia · 0050 · Qué avisos push recibe cada persona
--
-- Cada persona puede silenciar tipos de aviso: mensajes, tareas, incidencias,
-- ausencias y nóminas. Vale para todos sus dispositivos y sociedades. Sin fila
-- = recibe todos. Los avisos silenciados ni se encolan.
-- =====================================================================

create table public.push_preferences (
  user_id    uuid primary key references public.users (id) on delete cascade default app.current_user_id(),
  muted      text[] not null default '{}'
             check (muted <@ array['messages', 'tasks', 'incidents', 'leave', 'payslips']::text[]),
  updated_at timestamptz not null default now()
);

alter table public.push_preferences enable row level security;
create policy push_preferences_own on public.push_preferences for all to app_user
  using (user_id = (select app.current_user_id()))
  with check (user_id = (select app.current_user_id()));
grant select, insert, update, delete on public.push_preferences to app_user;

-- enqueue_push gana el tipo de aviso (primer parámetro) para respetar lo silenciado.
drop function app.enqueue_push(uuid, uuid[], text, text, text, text);

create or replace function app.enqueue_push(
  p_category text, p_org uuid, p_users uuid[], p_title text, p_body text, p_path text, p_tag text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := app.current_user_id();
  v_slug text;
  v_org_name text;
begin
  select o.slug, coalesce(o.trade_name, o.legal_name) into v_slug, v_org_name from public.organizations o where o.id = p_org;
  insert into public.push_outbox (organization_id, user_id, created_by, title, body, url, tag)
  select p_org, uo.user_id, v_actor, left(p_title, 120),
         left(regexp_replace(p_body, '\s+', ' ', 'g'), 180) || ' · ' || v_org_name,
         '/o/' || v_slug || p_path, p_tag
  from public.user_organizations uo
  where uo.organization_id = p_org
    and uo.status = 'active'
    and uo.user_id = any (p_users)
    and uo.user_id is distinct from v_actor
    and not exists (
      select 1 from public.push_preferences pp
      where pp.user_id = uo.user_id and p_category = any (pp.muted)
    );
end
$$;
revoke execute on function app.enqueue_push(text, uuid, uuid[], text, text, text, text) from public;

create or replace function app.push_on_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_subject text;
begin
  select t.subject into v_subject from public.message_threads t where t.id = new.thread_id;
  perform app.enqueue_push(
    'messages', new.organization_id,
    array(select p.user_id from public.message_participants p where p.thread_id = new.thread_id and p.user_id <> new.sender_id),
    app.user_name(new.sender_id) || ': ' || v_subject,
    new.body,
    '/mensajes/c/' || new.thread_id,
    'thread-' || new.thread_id);
  return null;
end
$$;

create or replace function app.push_on_task() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.assignee_user_id is distinct from old.assignee_user_id then
    perform app.enqueue_push(
      'tasks', new.organization_id, array[new.assignee_user_id],
      'Tarea nueva para ti',
      new.title || coalesce(' · para el ' || to_char(new.due_date, 'DD/MM'), ''),
      '/tareas/' || new.id,
      'task-' || new.id);
  end if;
  return null;
end
$$;

create or replace function app.push_on_incident() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_user_id is not null and (tg_op = 'INSERT' or new.assignee_user_id is distinct from old.assignee_user_id) then
    perform app.enqueue_push(
      'incidents', new.organization_id, array[new.assignee_user_id],
      'Incidencia #' || new.number || ' asignada a ti',
      new.title,
      '/incidencias/' || new.id,
      'incident-' || new.id);
  end if;
  return null;
end
$$;

create or replace function app.push_on_incident_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_inc public.incidents%rowtype;
begin
  select * into v_inc from public.incidents i where i.id = new.incident_id;
  perform app.enqueue_push(
    'incidents', new.organization_id, array[v_inc.reported_by, v_inc.assignee_user_id],
    app.user_name(new.author_id) || ' en la incidencia #' || v_inc.number,
    new.body,
    '/incidencias/' || v_inc.id,
    'incident-' || v_inc.id);
  return null;
end
$$;

create or replace function app.push_on_leave() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_type text := case new.leave_type when 'vacation' then 'Vacaciones' when 'sick' then 'Baja' when 'personal' then 'Asuntos propios'
                                     when 'parental' then 'Permiso parental' else 'Ausencia' end;
  v_dates text := to_char(new.starts_on, 'DD/MM') || case when new.ends_on <> new.starts_on then '–' || to_char(new.ends_on, 'DD/MM') else '' end;
begin
  if tg_op = 'INSERT' and new.status = 'requested' then
    perform app.enqueue_push(
      'leave', new.organization_id, app.org_users_with_permission(new.organization_id, 'hr.leave.approve'),
      app.user_name(new.user_id) || ' pide ' || lower(v_type),
      v_dates || coalesce(' · ' || new.reason, ''),
      '/rrhh/ausencias',
      'leave-' || new.id);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform app.enqueue_push(
      'leave', new.organization_id, array[new.user_id],
      v_type || case new.status when 'approved' then ' aprobada' else ' rechazada' end,
      v_dates,
      '/rrhh/ausencias',
      'leave-' || new.id);
  end if;
  return null;
end
$$;

create or replace function app.push_on_payslip() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.enqueue_push(
    'payslips', new.organization_id, array[new.user_id],
    'Tienes una nómina nueva',
    case new.kind when 'bonus' then 'Paga extra' when 'settlement' then 'Finiquito' else 'Nómina' end || ' de ' || to_char(new.period, 'MM/YYYY'),
    '/rrhh/nominas/' || new.id,
    'payslip-' || new.id);
  return null;
end
$$;

-- Activa (p_enabled) o silencia un tipo de aviso de quien llama. Devuelve lo silenciado.
create or replace function app.set_push_category(p_category text, p_enabled boolean) returns text[]
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := app.current_user_id();
  v_muted text[];
begin
  if v_user is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  insert into public.push_preferences (user_id, muted)
  values (v_user, case when p_enabled then '{}'::text[] else array[p_category] end)
  on conflict (user_id) do update
    set muted = case when p_enabled then array_remove(public.push_preferences.muted, p_category)
                     else array(select distinct unnest(public.push_preferences.muted || array[p_category])) end,
        updated_at = now()
  returning muted into v_muted;
  return v_muted;
end
$$;
grant execute on function app.set_push_category(text, boolean) to app_user;
