-- =====================================================================
-- Omnia · 0021 · Color del lomo a elegir
--
-- Además de los cuatro colores de la casa, cualquier color en hexadecimal
-- (#rrggbb, en minúsculas) elegido desde Ajustes › Sociedad.
-- =====================================================================

alter table public.organizations drop constraint organizations_spine_color_check;
alter table public.organizations add constraint organizations_spine_color_check
  check (spine_color in ('red', 'blue', 'yellow', 'green') or spine_color ~ '^#[0-9a-f]{6}$');
