-- =====================================================================
-- Omnia · 0045 · Nombre y apellidos al añadir un miembro
--
-- Quien gestiona miembros (members.manage) indica el nombre y apellidos de la
-- persona al añadirla a la sociedad. Se guarda en users.full_name, que solo
-- puede editar el propio usuario por RLS; esta función lo permite al gestor,
-- únicamente para personas que ya son miembros de una sociedad que gestiona.
-- =====================================================================

create or replace function app.set_member_name(p_org uuid, p_user uuid, p_full_name text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := nullif(btrim(regexp_replace(p_full_name, '\s+', ' ', 'g')), '');
begin
  if v_name is null then
    raise exception 'El nombre es obligatorio' using errcode = '22023';
  end if;
  if not exists (select 1 from app.authorized_org_ids('members.manage') a where a = p_org) then
    raise exception 'No puedes gestionar miembros en esta sociedad' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_organizations uo where uo.organization_id = p_org and uo.user_id = p_user) then
    raise exception 'Esa persona no es miembro de esta sociedad' using errcode = '42501';
  end if;
  update public.users set full_name = left(v_name, 160) where id = p_user;
end;
$$;
grant execute on function app.set_member_name(uuid, uuid, text) to app_user;
