-- =====================================================================
-- Omnia · 0040 · Tareas, Incidencias y Mensajes pasan al nivel Pro
--
-- Dejan de venir en el plan de entrada: una sociedad nueva no los trae al
-- darse de alta y quien la gestiona los ve con candado («Pro») para pedirlos.
-- El equipo de Omnia los activa desde el panel.
--
-- Las sociedades que ya existen conservan lo que tienen: esto solo cambia el alta.
-- =====================================================================

update public.features
set default_enabled = false
where code in ('tasks', 'incidents', 'messages');
