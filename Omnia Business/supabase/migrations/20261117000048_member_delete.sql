-- =====================================================================
-- Omnia · 0048 · Borrar miembros suspendidos
--
-- Solo un propietario ('*') puede sacar a una persona de la sociedad, y solo si
-- antes la ha suspendido. Si tiene historial (fichajes, nóminas, ausencias,
-- tickets, tareas, mensajes, tarjetas…), las FKs lo impiden: ese historial se
-- conserva (obligación legal) y la persona se queda suspendida.
-- Los borrados en cascada (p. ej. al borrar la sociedad) no pasan por aquí.
-- =====================================================================

create or replace function app.guard_membership_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'app_user' and pg_trigger_depth() = 1 then
    if not app.has_permission(old.organization_id, '*') then
      raise exception 'Solo un propietario puede borrar miembros' using errcode = '42501';
    end if;
    if old.status <> 'suspended' then
      raise exception 'Suspende a la persona antes de borrarla' using errcode = '23514';
    end if;
    if old.user_id = app.current_user_id() then
      raise exception 'No puedes borrarte a ti mismo' using errcode = '23514';
    end if;
  end if;
  return old;
end
$$;

create trigger user_organizations_guard_delete
  before delete on public.user_organizations
  for each row execute function app.guard_membership_delete();
