-- =====================================================================
-- Omnia · 0020 · Tareas
--
-- Un responsable (permiso tasks.manage) manda tareas a las personas de la
-- empresa y ve todas. Cada persona ve solo las suyas y solo cambia su estado
-- (empezada, hecha); el texto, la persona y la fecha los cambia un responsable.
-- =====================================================================

insert into public.permissions (code, module, description) values
  ('tasks.*',      'tasks', 'Todo sobre tareas'),
  ('tasks.manage', 'tasks', 'Mandar tareas y ver las de todos');

-- Administración y Encargado mandan tareas; Propietario ya lo tiene todo ('*').
create or replace function app.seed_task_permissions(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.role_permissions (organization_id, role_id, permission_code)
  select r.organization_id, r.id, 'tasks.*'
  from public.roles r
  where r.organization_id = p_org and r.key in ('admin', 'floor_manager')
  on conflict do nothing;
$$;
revoke all on function app.seed_task_permissions(uuid) from public;

select app.seed_task_permissions(id) from public.organizations;

-- Las organizaciones nuevas nacen con ellos: se siembran tras los roles de sala.
create or replace function app.seed_task_permissions_on_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.seed_task_permissions(new.organization_id);
  return new;
end
$$;
-- create_organization crea el rol Encargado el último (seed_pos_roles): al
-- insertar sus permisos, Administración ya existe.
create trigger roles_seed_tasks after insert on public.roles
  for each row when (new.key in ('admin', 'floor_manager')) execute function app.seed_task_permissions_on_role();

create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  title            text not null check (char_length(title) between 3 and 200),
  description      text check (description is null or char_length(description) <= 5000),
  assignee_user_id uuid not null,
  assigned_by      uuid not null references public.users (id) default app.current_user_id(),
  due_date         date,
  status           text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, assignee_user_id) references public.user_organizations (organization_id, user_id),
  check ((status = 'done') = (completed_at is not null))
);
create index tasks_assignee_idx on public.tasks (organization_id, assignee_user_id, status);
create index tasks_open_idx on public.tasks (organization_id, status, due_date);

-- Hecha ↔ fecha de terminada. Quien no es responsable solo cambia el estado.
create or replace function app.guard_task() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  if tg_op = 'UPDATE' and not app.has_permission(old.organization_id, 'tasks.manage')
     and (new.title, new.description, new.assignee_user_id, new.assigned_by, new.due_date, new.organization_id)
         is distinct from (old.title, old.description, old.assignee_user_id, old.assigned_by, old.due_date, old.organization_id) then
    raise exception 'Solo un responsable cambia la tarea; tú puedes marcarla como empezada o hecha' using errcode = 'OM002';
  end if;
  return new;
end
$$;

create trigger tasks_guard before insert or update on public.tasks
  for each row execute function app.guard_task();
create trigger tasks_touch before update on public.tasks
  for each row execute function app.touch_updated_at();
create trigger tasks_audit after insert or update or delete on public.tasks
  for each row execute function app.audit_row();

alter table public.tasks enable row level security;
create policy tasks_select on public.tasks for select to app_user
  using (
    organization_id in (select app.authorized_org_ids('tasks.manage'))
    or (organization_id in (select app.active_org_ids()) and assignee_user_id = (select app.current_user_id()))
  );
create policy tasks_insert on public.tasks for insert to app_user
  with check (
    organization_id in (select app.authorized_org_ids('tasks.manage'))
    and assigned_by = (select app.current_user_id())
  );
create policy tasks_update on public.tasks for update to app_user
  using (
    organization_id in (select app.authorized_org_ids('tasks.manage'))
    or (organization_id in (select app.active_org_ids()) and assignee_user_id = (select app.current_user_id()))
  )
  with check (
    organization_id in (select app.authorized_org_ids('tasks.manage'))
    or (organization_id in (select app.active_org_ids()) and assignee_user_id = (select app.current_user_id()))
  );
create policy tasks_delete on public.tasks for delete to app_user
  using (organization_id in (select app.authorized_org_ids('tasks.manage')));
grant select, insert, update, delete on public.tasks to app_user;
