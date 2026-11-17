-- =====================================================================
-- Omnia · 0049 · Notificaciones push
--
-- * push_subscriptions: cada navegador/dispositivo en el que la persona activa
--   las notificaciones (Web Push: endpoint + claves). Cada uno ve y borra solo
--   las suyas.
-- * push_outbox: cola de avisos. La rellenan triggers al ocurrir algo que
--   interesa a otra persona (mensaje, tarea o incidencia asignada, ausencias,
--   nóminas). Solo se avisa a miembros activos y nunca a quien lo ha hecho.
-- * app.claim_push_outbox(): tras cada acción, el backend recoge los avisos
--   que ha generado ESA persona (created_by) con las suscripciones de los
--   destinatarios y los envía. Nadie puede leer avisos que no ha provocado.
-- =====================================================================

create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade default app.current_user_id(),
  endpoint     text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh       text not null check (char_length(p256dh) <= 200),
  auth         text not null check (char_length(auth) <= 100),
  user_agent   text check (char_length(user_agent) <= 300),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for all to app_user
  using (user_id = (select app.current_user_id()))
  with check (user_id = (select app.current_user_id()));
grant select, insert, update, delete on public.push_subscriptions to app_user;

create table public.push_outbox (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  created_by      uuid references public.users (id) on delete set null,
  title           text not null,
  body            text not null,
  url             text not null,
  -- Mismo tag = sustituye la notificación anterior (p. ej. varios mensajes del mismo hilo).
  tag             text,
  created_at      timestamptz not null default now(),
  claimed_at      timestamptz
);
create index push_outbox_pending_idx on public.push_outbox (created_by, created_at) where claimed_at is null;
-- Sin acceso directo: solo los triggers (DEFINER) escriben y app.claim_push_outbox lee.
alter table public.push_outbox enable row level security;

-- ---------------------------------------------------------------------------
-- Encolar
-- ---------------------------------------------------------------------------

create or replace function app.enqueue_push(
  p_org uuid, p_users uuid[], p_title text, p_body text, p_path text, p_tag text default null
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
    and uo.user_id is distinct from v_actor;
end
$$;

/** Miembros activos con un permiso (mismas reglas que app.authorized_org_ids: '*', 'módulo.*' o exacto). */
create or replace function app.org_users_with_permission(p_org uuid, p_permission text) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct uo.user_id), '{}')
  from public.user_organizations uo
  join public.role_permissions rp on rp.role_id = uo.role_id
  where uo.organization_id = p_org and uo.status = 'active'
    and rp.permission_code in ('*', split_part(p_permission, '.', 1) || '.*', p_permission)
$$;

create or replace function app.user_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(u.full_name, u.email) from public.users u where u.id = p_user
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Mensaje nuevo → el resto de participantes del hilo.
create or replace function app.push_on_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_subject text;
begin
  select t.subject into v_subject from public.message_threads t where t.id = new.thread_id;
  perform app.enqueue_push(
    new.organization_id,
    array(select p.user_id from public.message_participants p where p.thread_id = new.thread_id and p.user_id <> new.sender_id),
    app.user_name(new.sender_id) || ': ' || v_subject,
    new.body,
    '/mensajes/c/' || new.thread_id,
    'thread-' || new.thread_id);
  return null;
end
$$;
create trigger messages_push after insert on public.messages
  for each row execute function app.push_on_message();

-- Tarea asignada (al crearla o al cambiar de responsable) → el responsable.
create or replace function app.push_on_task() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.assignee_user_id is distinct from old.assignee_user_id then
    perform app.enqueue_push(
      new.organization_id, array[new.assignee_user_id],
      'Tarea nueva para ti',
      new.title || coalesce(' · para el ' || to_char(new.due_date, 'DD/MM'), ''),
      '/tareas/' || new.id,
      'task-' || new.id);
  end if;
  return null;
end
$$;
create trigger tasks_push after insert or update of assignee_user_id on public.tasks
  for each row execute function app.push_on_task();

-- Incidencia asignada → el responsable.
create or replace function app.push_on_incident() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_user_id is not null and (tg_op = 'INSERT' or new.assignee_user_id is distinct from old.assignee_user_id) then
    perform app.enqueue_push(
      new.organization_id, array[new.assignee_user_id],
      'Incidencia #' || new.number || ' asignada a ti',
      new.title,
      '/incidencias/' || new.id,
      'incident-' || new.id);
  end if;
  return null;
end
$$;
create trigger incidents_push after insert or update of assignee_user_id on public.incidents
  for each row execute function app.push_on_incident();

-- Comentario en una incidencia → quien la abrió y quien la tiene asignada.
create or replace function app.push_on_incident_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_inc public.incidents%rowtype;
begin
  select * into v_inc from public.incidents i where i.id = new.incident_id;
  perform app.enqueue_push(
    new.organization_id, array[v_inc.reported_by, v_inc.assignee_user_id],
    app.user_name(new.author_id) || ' en la incidencia #' || v_inc.number,
    new.body,
    '/incidencias/' || v_inc.id,
    'incident-' || v_inc.id);
  return null;
end
$$;
create trigger incident_comments_push after insert on public.incident_comments
  for each row execute function app.push_on_incident_comment();

-- Ausencias: la solicitud → quien puede aprobarla; la resolución → quien la pidió.
create or replace function app.push_on_leave() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_type text := case new.leave_type when 'vacation' then 'Vacaciones' when 'sick' then 'Baja' when 'personal' then 'Asuntos propios'
                                     when 'parental' then 'Permiso parental' else 'Ausencia' end;
  v_dates text := to_char(new.starts_on, 'DD/MM') || case when new.ends_on <> new.starts_on then '–' || to_char(new.ends_on, 'DD/MM') else '' end;
begin
  if tg_op = 'INSERT' and new.status = 'requested' then
    perform app.enqueue_push(
      new.organization_id, app.org_users_with_permission(new.organization_id, 'hr.leave.approve'),
      app.user_name(new.user_id) || ' pide ' || lower(v_type),
      v_dates || coalesce(' · ' || new.reason, ''),
      '/rrhh/ausencias',
      'leave-' || new.id);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform app.enqueue_push(
      new.organization_id, array[new.user_id],
      v_type || case new.status when 'approved' then ' aprobada' else ' rechazada' end,
      v_dates,
      '/rrhh/ausencias',
      'leave-' || new.id);
  end if;
  return null;
end
$$;
create trigger leave_requests_push after insert or update of status on public.leave_requests
  for each row execute function app.push_on_leave();

-- Nómina subida → su titular.
create or replace function app.push_on_payslip() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.enqueue_push(
    new.organization_id, array[new.user_id],
    'Tienes una nómina nueva',
    case new.kind when 'bonus' then 'Paga extra' when 'settlement' then 'Finiquito' else 'Nómina' end || ' de ' || to_char(new.period, 'MM/YYYY'),
    '/rrhh/nominas/' || new.id,
    'payslip-' || new.id);
  return null;
end
$$;
create trigger payslips_push after insert on public.payslips
  for each row execute function app.push_on_payslip();

-- ---------------------------------------------------------------------------
-- Envío
-- ---------------------------------------------------------------------------

-- Avisos pendientes que ha provocado quien llama (última hora), con las
-- suscripciones de cada destinatario. Los marca como recogidos.
create or replace function app.claim_push_outbox()
returns table (id bigint, user_id uuid, title text, body text, url text, tag text, endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := app.current_user_id();
begin
  if v_actor is null then
    return;
  end if;
  return query
  with claimed as (
    update public.push_outbox o set claimed_at = now()
    where o.claimed_at is null and o.created_by = v_actor and o.created_at > now() - interval '1 hour'
    returning o.id, o.user_id, o.title, o.body, o.url, o.tag
  )
  select c.id, c.user_id, c.title, c.body, c.url, c.tag, s.endpoint, s.p256dh, s.auth
  from claimed c join public.push_subscriptions s on s.user_id = c.user_id;
end
$$;

-- El servicio de push dice que la suscripción ya no existe (410/404): se borra.
create or replace function app.drop_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint
$$;

grant execute on function app.claim_push_outbox() to app_user;
grant execute on function app.drop_push_subscription(text) to app_user;
revoke execute on function app.enqueue_push(uuid, uuid[], text, text, text, text) from public;
revoke execute on function app.org_users_with_permission(uuid, text) from public;
revoke execute on function app.user_name(uuid) from public;
