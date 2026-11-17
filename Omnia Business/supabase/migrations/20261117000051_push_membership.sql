-- =====================================================================
-- Omnia · 0051 · Aviso push al dar acceso a una sociedad
--
-- Cuando un propietario (o quien gestiona miembros) añade a alguien que ya usa
-- Omnia, su alta entra activa: se le avisa al momento en sus dispositivos y la
-- notificación abre esa sociedad, empresa u holding. Las altas «invitadas»
-- (cuenta nueva) no avisan: aún no tienen dispositivos; les llega el correo.
-- Este aviso no se puede silenciar (no es uno de los tipos de push_preferences).
-- =====================================================================

create or replace function app.push_on_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
begin
  if new.status = 'active' then
    select r.name into v_role from public.roles r where r.id = new.role_id;
    perform app.enqueue_push(
      'access', new.organization_id, array[new.user_id],
      'Te han dado acceso a una sociedad nueva',
      app.user_name(app.current_user_id()) || ' te ha añadido con el rol ' || coalesce(v_role, '—'),
      '',
      'access-' || new.organization_id);
  end if;
  return null;
end
$$;
create trigger user_organizations_push after insert on public.user_organizations
  for each row execute function app.push_on_membership();
