-- =====================================================================
-- Omnia · 0036 · Empresas de todas mis sociedades (barra lateral)
--
-- La barra lateral enseña el árbol completo: holding → sociedades → empresas.
-- Las membresías se leen sin sociedad activa (app.my_memberships), así que las
-- empresas también necesitan una lectura propia: solo las de sociedades en las
-- que la persona es miembro activo, y solo las activas.
-- =====================================================================

create or replace function app.my_establishments()
returns table (organization_id uuid, id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select e.organization_id, e.id, e.name
  from public.establishments e
  join public.user_organizations uo on uo.organization_id = e.organization_id
  where uo.user_id = app.current_user_id() and uo.status = 'active' and e.is_active
  order by e.organization_id, e.name
$$;
revoke all on function app.my_establishments() from public;
grant execute on function app.my_establishments() to app_user;
