-- =====================================================================
-- Omnia · 0015 · Desvincular el terminal desde la propia tablet
--
-- Desde la pantalla de PIN, sin sesión de usuario: basta con tener el token
-- del dispositivo (quien lo tiene ya podía usar el terminal). El terminal
-- queda revocado, como si lo hubiera desvinculado un encargado en Ajustes ›
-- TPV, y la tablet puede vincularse con otro código.
-- =====================================================================

create or replace function app.pos_unpair_terminal(p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  update public.pos_terminals
  set revoked_at = now(), pairing_code_hash = null, pairing_expires_at = null
  where token_hash = p_token_hash and revoked_at is null
  returning id into v_id;
  return v_id;
end
$$;

revoke all on function app.pos_unpair_terminal(text) from public;
grant execute on function app.pos_unpair_terminal(text) to app_user;
