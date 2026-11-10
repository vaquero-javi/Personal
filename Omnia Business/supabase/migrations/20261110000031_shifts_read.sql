-- =====================================================================
-- Omnia · 0031 · Ver los turnos de todo el equipo
--
-- Nuevo permiso marcable por rol: quien lo tiene ve el cuadrante completo
-- (pensado para encargados, gerentes… que montan o consultan los turnos).
-- Sin él, cada persona ve solo sus turnos. Planificarlos sigue siendo
-- 'hr.shifts.manage', que también deja verlos todos.
--
-- 'hr.time.read' sigue leyendo la tabla (el registro de jornada cruza los
-- fichajes con el turno para avisar de retrasos), pero la pantalla de Turnos
-- ya no se lo concede: para eso está este permiso. Los roles que hoy veían
-- el cuadrante gracias a 'hr.time.read' lo reciben para no perder nada.
-- SQL portable (PostgreSQL 15+).
-- =====================================================================

insert into public.permissions (code, module, description) values
  ('hr.shifts.read', 'hr', 'Ver los turnos de todo el equipo')
on conflict (code) do nothing;

insert into public.role_permissions (organization_id, role_id, permission_code)
select distinct rp.organization_id, rp.role_id, 'hr.shifts.read'
from public.role_permissions rp
where rp.permission_code in ('hr.time.read', 'hr.shifts.manage')
on conflict do nothing;

drop policy shifts_select on public.shifts;
create policy shifts_select on public.shifts for select to app_user
  using (
    (user_id = (select app.current_user_id()) and organization_id in (select app.active_org_ids()))
    or organization_id in (select app.authorized_org_ids('hr.shifts.read'))
    or organization_id in (select app.authorized_org_ids('hr.shifts.manage'))
    or organization_id in (select app.authorized_org_ids('hr.time.read'))
  );

-- Las empresas nuevas: el rol Encargado de la plantilla nace con el permiso.
create or replace function app.seed_shifts_read_on_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_permissions (organization_id, role_id, permission_code)
  values (new.organization_id, new.id, 'hr.shifts.read')
  on conflict do nothing;
  return new;
end
$$;
revoke all on function app.seed_shifts_read_on_role() from public;
create trigger roles_seed_shifts_read after insert on public.roles
  for each row when (new.key = 'floor_manager') execute function app.seed_shifts_read_on_role();
