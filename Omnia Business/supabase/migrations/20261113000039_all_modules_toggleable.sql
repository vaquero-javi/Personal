-- =====================================================================
-- Omnia · 0039 · Todos los módulos y submódulos se activan o se quitan
--
-- Hasta ahora Base, Almacén, Facturación, Personal, Tareas e Incidencias eran
-- «base» (siempre activos). Pasan a ser módulos como los demás: el equipo de
-- Omnia los da o los quita desde el panel. Ya no queda ningún módulo fijo.
--
-- Se añaden como submódulos las secciones de cada módulo que todavía no lo eran.
--
-- Nadie pierde nada al migrar: cada sociedad recibe activo todo lo que pasa a
-- ser módulo, y lo nuevo nace activado en las sociedades que se den de alta.
--
-- Cómo se protege cada uno:
--   * Tareas e Incidencias: sus tablas solo las usa su módulo → política
--     restrictiva en la RLS (apply_feature_gate), como los módulos de pago.
--   * Base, Almacén, Facturación y Personal: sus tablas también las usan Ventas,
--     Compras y el TPV (terceros, artículos, stock, facturas, fichajes), así que no se
--     tapan en la RLS; se comprueban en la aplicación (páginas y acciones).
--   * Los submódulos nuevos son de interfaz (permission_gates vacío).
-- =====================================================================

update public.features
set is_core = false, default_enabled = true
where code in ('base', 'inventory', 'invoicing', 'hr', 'tasks', 'incidents');

update public.features
set name = 'Inicio y ajustes', description = 'Inicio, buscador y los datos de la sociedad.'
where code = 'base';

update public.features
set description = 'Fichar, registro de jornada, turnos, vacaciones, permisos y nóminas.'
where code = 'hr';

insert into public.features (code, parent_code, name, description, is_core, default_enabled, permission_gates, sort_order) values
  ('base.parties',                 'base',      'Clientes y proveedores', 'Fichas de clientes y proveedores.',                             false, true, '{}', 11),
  ('base.members',                 'base',      'Miembros',              'Personas de la sociedad e invitaciones.',                        false, true, '{}', 12),
  ('base.roles',                   'base',      'Roles y permisos',      'Roles propios y qué puede hacer cada uno.',                      false, true, '{}', 13),
  ('base.custom_fields',           'base',      'Campos personalizados', 'Campos extra en las fichas de la aplicación.',                   false, true, '{}', 14),
  ('base.establishments',          'base',      'Empresas',              'Negocios o locales de la sociedad.',                             false, true, '{}', 15),
  ('inventory.goods_receipts',     'inventory', 'Entradas (albaranes)',  'Albaranes de entrada de mercancía, también leídos de una foto.', false, true, '{}', 21),
  ('inventory.movements',          'inventory', 'Movimientos y ajustes', 'Libro de movimientos de stock y ajustes manuales.',              false, true, '{}', 22),
  ('inventory.warehouses',         'inventory', 'Almacenes',             'Varios almacenes y la empresa a la que pertenece cada uno.',     false, true, '{}', 23),
  ('invoicing.verifactu',          'invoicing', 'Registros VeriFactu',   'Registros enviados a la AEAT y su estado.',                      false, true, '{}', 31),
  ('invoicing.series',             'invoicing', 'Series',                'Series de numeración de facturas.',                              false, true, '{}', 32),
  ('hr.time_log',                  'hr',        'Registro de jornada',   'Fichajes de todo el personal y correcciones manuales.',          false, true, '{}', 401),
  ('hr.leave',                     'hr',        'Vacaciones y permisos', 'Solicitudes de ausencia y su aprobación.',                       false, true, '{}', 405),
  ('stats.comparison',             'stats',     'Comparación',           'Comparar periodos y sociedades.',                                false, true, '{}', 310),
  ('stats.income_statement',       'stats',     'Cuenta de resultados',  'Ingresos, gastos y resultado del periodo.',                      false, true, '{}', 320),
  ('stats.financial_statements',   'stats',     'Estados financieros',   'Balance y estados financieros.',                                 false, true, '{}', 330),
  ('stats.reports',                'stats',     'Informes de gestión',   'Informes de gestión para descargar.',                            false, true, '{}', 340),
  ('stats.establishments',         'stats',     'Por empresa',           'Estadísticas separadas por cada empresa de la sociedad.',        false, true, '{}', 350);

-- Las sociedades que ya existen conservan todo lo que tenían.
insert into public.organization_features (organization_id, feature_code, is_active, activated_at)
select o.id, f.code, true, now()
from public.organizations o
cross join public.features f
where f.code in ('base', 'inventory', 'invoicing', 'hr', 'tasks', 'incidents')
   or f.code in ('base.parties', 'base.members', 'base.roles', 'base.custom_fields', 'base.establishments',
                 'inventory.goods_receipts', 'inventory.movements', 'inventory.warehouses',
                 'invoicing.verifactu', 'invoicing.series', 'hr.time_log', 'hr.leave',
                 'stats.comparison', 'stats.income_statement', 'stats.financial_statements',
                 'stats.reports', 'stats.establishments')
on conflict (organization_id, feature_code) do nothing;

insert into public.organization_feature_events (organization_id, feature_code, is_active, source)
select o.id, f.code, true, 'migration'
from public.organizations o
cross join public.features f
where f.code in ('base', 'inventory', 'invoicing', 'hr', 'tasks', 'incidents')
   or f.code in ('base.parties', 'base.members', 'base.roles', 'base.custom_fields', 'base.establishments',
                 'inventory.goods_receipts', 'inventory.movements', 'inventory.warehouses',
                 'invoicing.verifactu', 'invoicing.series', 'hr.time_log', 'hr.leave',
                 'stats.comparison', 'stats.income_statement', 'stats.financial_statements',
                 'stats.reports', 'stats.establishments');

-- Tareas e Incidencias: sin el módulo, ni se leen ni se escriben (ni con supabase-js).
select app.apply_feature_gate('public.tasks', 'tasks');
select app.apply_feature_gate('public.incidents', 'incidents');
select app.apply_feature_gate('public.incident_comments', 'incidents');
