-- =====================================================================
-- Omnia · 0033 · Inicio de sesión propio del panel del equipo (apps/admin)
--
-- El panel no usa las cuentas de las sociedades (Supabase Auth): tiene su
-- propio email + contraseña, guardada con scrypt en platform_admins.
--
-- Separación de credenciales:
--   * La web se conecta como `omnia_api`; el panel, como `omnia_admin`.
--   * Solo `omnia_admin` puede ejecutar las funciones de acceso (que devuelven el
--     hash). Ni app_user, ni authenticated (supabase-js), ni la web pueden leerlo.
--   * El hash se comprueba en el servidor del panel (scrypt, tiempo constante);
--     la base lleva el contador de fallos y el bloqueo.
-- =====================================================================

alter table public.platform_admins
  add column password_hash   text check (password_hash is null or password_hash ~ '^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$'),
  add column failed_attempts integer not null default 0 check (failed_attempts >= 0),
  add column locked_until    timestamptz,
  -- Sube al cambiar la contraseña: las sesiones firmadas con la versión anterior dejan de valer.
  add column session_version integer not null default 1 check (session_version >= 1),
  add column last_login_at   timestamptz;

-- Rol de conexión del panel. Contraseña fuera de las migraciones:
--   alter role omnia_admin with password '…';
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'omnia_admin') then
    create role omnia_admin login noinherit nobypassrls;
  end if;
end
$$;
-- Para las funciones app.admin_* (withUser → SET ROLE app_user).
grant app_user to omnia_admin;
-- Las funciones de acceso se llaman antes del SET ROLE, como omnia_admin.
grant usage on schema app, public to omnia_admin;

-- Datos para comprobar la contraseña. Devuelve fila aunque no haya contraseña
-- (password_hash null) para que el panel trate igual «no existe» y «sin clave».
create or replace function app.platform_admin_credentials(p_email text)
returns table (user_id uuid, password_hash text, locked_until timestamptz, session_version integer)
language sql stable security definer set search_path = '' as $$
  select pa.user_id, pa.password_hash, pa.locked_until, pa.session_version
  from public.platform_admins pa
  join public.users u on u.id = pa.user_id
  where lower(u.email) = lower(trim(p_email))
$$;

-- Resultado del intento: si es bueno, limpia el contador; si es malo, lo sube y
-- a los 5 seguidos bloquea 15 minutos. Devuelve la versión de sesión vigente.
create or replace function app.platform_admin_login_result(p_user uuid, p_ok boolean)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_version integer;
begin
  if p_ok then
    update public.platform_admins
    set failed_attempts = 0, locked_until = null, last_login_at = now()
    where user_id = p_user
    returning session_version into v_version;
  else
    update public.platform_admins
    set failed_attempts = failed_attempts + 1,
        locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
    where user_id = p_user;
    -- Tras bloquear, el contador vuelve a empezar para la siguiente tanda.
    update public.platform_admins set failed_attempts = 0
    where user_id = p_user and failed_attempts >= 5;
  end if;
  return v_version;
end
$$;

-- Comprobación de cada petición: ¿sigue en el equipo y con esta versión de sesión?
create or replace function app.platform_admin_session_valid(p_user uuid, p_version integer)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = p_user and session_version = p_version and password_hash is not null
  )
$$;

-- Fijar o cambiar la contraseña (cierra las sesiones abiertas). SIN GRANT:
-- solo desde el SQL Editor de Supabase o con `npm run admin:password`.
create or replace function app.set_platform_admin_password(p_email text, p_hash text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_hash !~ '^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$' then
    raise exception 'Hash no válido: genéralo con npm run admin:password';
  end if;
  update public.platform_admins pa
  set password_hash = p_hash, session_version = pa.session_version + 1, failed_attempts = 0, locked_until = null
  from public.users u
  where u.id = pa.user_id and lower(u.email) = lower(trim(p_email));
  if not found then
    raise exception 'No hay nadie del equipo con ese email (añádelo antes a public.platform_admins)';
  end if;
end
$$;

revoke all on function app.platform_admin_credentials(text) from public;
revoke all on function app.platform_admin_login_result(uuid, boolean) from public;
revoke all on function app.platform_admin_session_valid(uuid, integer) from public;
revoke all on function app.set_platform_admin_password(text, text) from public;
grant execute on function app.platform_admin_credentials(text) to omnia_admin;
grant execute on function app.platform_admin_login_result(uuid, boolean) to omnia_admin;
grant execute on function app.platform_admin_session_valid(uuid, integer) to omnia_admin;
