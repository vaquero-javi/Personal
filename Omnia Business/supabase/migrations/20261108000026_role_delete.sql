-- =====================================================================
-- Omnia · 0026 · Permiso propio para eliminar roles
--
-- Borrar un rol deja de colgar de 'roles.manage' (crear y editar) y pasa a
-- 'roles.delete', que el propietario concede a quien quiera (p. ej. Gerente).
-- El propietario ('*') lo tiene siempre; 'roles.*' también lo incluye.
--
-- Los roles de sistema siguen sin poder borrarse. Si el rol tiene personas,
-- la aplicación las pasa antes a otro rol: eso es cambiar roles de miembros,
-- así que además exige 'members.manage' (lo impone la RLS de
-- user_organizations) y nunca puede ser el rol de propietario (lo impide
-- app.guard_membership_role). Así 'roles.delete' no sirve para ascender a nadie.
-- =====================================================================

insert into public.permissions (code, module, description) values
  ('roles.delete', 'roles', 'Eliminar roles (y pasar a otro rol a quien lo tenga)')
on conflict (code) do nothing;

drop policy if exists roles_write on public.roles;

create policy roles_insert on public.roles for insert to app_user
  with check (organization_id in (select app.authorized_org_ids('roles.manage')) and not is_system);

create policy roles_update on public.roles for update to app_user
  using (organization_id in (select app.authorized_org_ids('roles.manage')) and not is_system)
  with check (organization_id in (select app.authorized_org_ids('roles.manage')) and not is_system);

create policy roles_delete on public.roles for delete to app_user
  using (organization_id in (select app.authorized_org_ids('roles.delete')) and not is_system);
