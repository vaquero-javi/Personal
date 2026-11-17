-- =====================================================================
-- Omnia · 0047 · Aceptar invitaciones
--
-- Al añadir a una persona que aún no ha entrado nunca en Omnia, su alta en la
-- sociedad queda «invitada» (sin acceso). Cuando entra por primera vez (pone
-- su contraseña desde el correo, o entra con Google o con su contraseña), todas
-- sus invitaciones pendientes pasan a activas.
-- =====================================================================

create or replace function app.accept_invitations() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := app.current_user_id();
  v_count integer;
begin
  if v_user is null then
    return 0;
  end if;
  update public.user_organizations
     set status = 'active'
   where user_id = v_user and status = 'invited';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function app.accept_invitations() to app_user;
