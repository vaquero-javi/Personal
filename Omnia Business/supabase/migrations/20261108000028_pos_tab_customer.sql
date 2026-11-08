-- =====================================================================
-- Omnia · 0028 · Nombre del cliente en la cuenta de una mesa
--
-- Al abrir una mesa, el camarero puede apuntar el nombre de quien pide (o
-- dejarlo en blanco). Sale en la comanda que llega a barra/cocina junto al
-- número de mesa, en el pre-ticket y en el plano de mesas. Distinto de
-- `label`, que nombra las cuentas sin mesa (Barra, Para llevar…).
-- Se puede cambiar mientras la cuenta está abierta (app.guard_pos_tab impide
-- tocar las cerradas); los permisos son los de pos_tabs.
-- =====================================================================

alter table public.pos_tabs
  add column customer_name text check (customer_name is null or char_length(customer_name) between 1 and 40);
