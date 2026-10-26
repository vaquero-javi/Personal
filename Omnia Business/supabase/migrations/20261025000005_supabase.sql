-- =====================================================================
-- Omnia · 0005 · Adaptación a Supabase (NO aplicar en RDS / Cloud SQL)
--
-- En enterprise, el equivalente es: crear el rol LOGIN del backend
-- (ver docs/arquitectura.md §2.4) y sincronizar `public.users` desde el IdP.
-- =====================================================================

-- Supabase concede por defecto todo sobre `public` a anon/authenticated.
-- Omnia no expone tablas a anon; authenticated hereda de app_user, de modo que
-- las mismas políticas RLS rigen si algún día se lee vía PostgREST/supabase-js
-- (enviando la cabecera `x-organization-id`).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public, app from anon;
alter default privileges in schema public revoke all on tables from anon, authenticated;
grant app_user to authenticated;

-- Perfil de aplicación sincronizado con Supabase Auth.
create or replace function app.sync_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.users.full_name, excluded.full_name);
  return new;
end
$$;

create trigger on_auth_user_upsert
  after insert or update of email on auth.users
  for each row execute function app.sync_auth_user();

-- Rol con el que se conecta el backend (Supavisor, modo transacción, puerto 6543).
-- La contraseña se fija fuera de las migraciones:
--   alter role omnia_api with password '…';
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'omnia_api') then
    create role omnia_api login noinherit nobypassrls;
  end if;
end
$$;
grant app_user to omnia_api;
