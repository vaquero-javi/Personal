-- =====================================================================
-- Omnia · 0018 · Borrar terminales sin vincular
--
-- Un terminal pendiente o desvinculado se puede borrar desde Ajustes › TPV.
-- Las cajas y cuentas guardan el terminal en el que se hicieron, así que el
-- borrado es lógico: la fila se queda para el historial, desaparece de la
-- lista y su nombre vuelve a estar libre para un terminal nuevo.
-- =====================================================================

alter table public.pos_terminals add column deleted_at timestamptz;

alter table public.pos_terminals drop constraint pos_terminals_organization_id_name_key;
create unique index pos_terminals_name_live on public.pos_terminals (organization_id, name) where deleted_at is null;

grant select (deleted_at) on public.pos_terminals to app_user;
grant update (deleted_at) on public.pos_terminals to app_user;
