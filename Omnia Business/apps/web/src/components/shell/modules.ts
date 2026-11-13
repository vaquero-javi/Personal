// Compartido entre servidor y cliente (no es un módulo 'use client').

/**
 * Módulos de la barra lateral: el permiso de ROL mínimo para verlos y el módulo
 * CONTRATADO que exigen (catálogo en public.features). Si el rol lo permite pero
 * la sociedad no lo tiene, quien la gestiona lo ve con candado (upsell) y el
 * resto no lo ve. La RLS decide lo demás.
 */
export const MODULES = [
  { slug: '', label: 'Inicio', permission: null, feature: 'base' },
  { slug: 'ventas', label: 'Ventas', permission: 'sales.read', feature: 'sales' },
  { slug: 'compras', label: 'Compras', permission: 'purchasing.read', feature: 'purchasing' },
  { slug: 'almacen', label: 'Almacén', permission: 'inventory.read', feature: 'inventory' },
  { slug: 'facturacion', label: 'Facturación', permission: 'invoicing.read', feature: 'invoicing' },
  { slug: 'rrhh', label: 'RRHH', permission: null, feature: 'hr' },
  { slug: 'incidencias', label: 'Incidencias', permission: null, feature: 'incidents' },
  { slug: 'tareas', label: 'Tareas', permission: null, feature: 'tasks' },
  { slug: 'mensajes', label: 'Mensajes', permission: null, feature: 'messages' },
  { slug: 'estadisticas', label: 'Estadísticas', permission: 'stats.read', feature: 'stats' },
  { slug: 'ajustes', label: 'Ajustes', permission: 'members.read', feature: 'base' },
] as const satisfies readonly { slug: string; label: string; permission: string | null; feature: string | null }[];

export type ModuleSlug = (typeof MODULES)[number]['slug'];

export const moduleLabel = (slug: string) => MODULES.find((m) => m.slug === slug)?.label;
