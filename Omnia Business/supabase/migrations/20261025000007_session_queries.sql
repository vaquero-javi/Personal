-- =====================================================================
-- Omnia · 0007 · Consultas de sesión
-- =====================================================================

-- La estantería del usuario: cada sociedad de la que es miembro activo, con su
-- rol y la lista de permisos efectivos. Se usa para pintar el raíl, resolver
-- /o/<slug> a un id y ocultar acciones sin permiso (la RLS sigue mandando).
create or replace function app.my_memberships()
returns table (
  organization_id uuid,
  slug text,
  legal_name text,
  trade_name text,
  tax_id text,
  spine_color text,
  parent_id uuid,
  role_key text,
  role_name text,
  permissions text[],
  is_default boolean
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.slug, o.legal_name, o.trade_name, o.tax_id, o.spine_color, o.parent_id,
         r.key, r.name,
         coalesce(array_agg(rp.permission_code order by rp.permission_code) filter (where rp.permission_code is not null), '{}'),
         uo.is_default
  from public.user_organizations uo
  join public.organizations o on o.id = uo.organization_id
  join public.roles r on r.id = uo.role_id
  left join public.role_permissions rp on rp.role_id = r.id
  where uo.user_id = app.current_user_id() and uo.status = 'active'
  group by o.id, r.id, uo.is_default, uo.created_at
  order by uo.created_at, o.legal_name
$$;
grant execute on function app.my_memberships() to app_user;

-- Para dar de alta a un miembro: el usuario debe existir (se registró en el IdP)
-- y quien busca debe gestionar miembros en la organización activa.
create or replace function app.find_user_by_email(p_email text)
returns table (id uuid, email text, full_name text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email, u.full_name
  from public.users u
  where lower(u.email) = lower(trim(p_email))
    and exists (select 1 from app.authorized_org_ids('members.manage'))
$$;
grant execute on function app.find_user_by_email(text) to app_user;
