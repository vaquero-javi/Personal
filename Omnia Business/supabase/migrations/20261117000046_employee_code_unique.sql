-- =====================================================================
-- Omnia · 0046 · Código de empleado único por sociedad
--
-- El código de empleado (p. ej. el número de la gestoría) identifica a una
-- persona dentro de una sociedad: no puede repetirse en la misma sociedad
-- (sin distinguir mayúsculas). Es opcional; vacío se guarda como null.
-- =====================================================================

update public.user_organizations
   set employee_code = nullif(btrim(employee_code), '')
 where employee_code is distinct from nullif(btrim(employee_code), '');

create unique index user_organizations_employee_code_key
  on public.user_organizations (organization_id, lower(employee_code))
  where employee_code is not null;
