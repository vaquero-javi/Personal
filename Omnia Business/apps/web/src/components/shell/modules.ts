// Compartido entre servidor y cliente (no es un módulo 'use client').

/** Módulos y el permiso mínimo para verlos en la barra lateral (la RLS decide lo demás). */
export const MODULES = [
  { slug: '', label: 'Inicio', permission: null },
  { slug: 'ventas', label: 'Ventas', permission: 'sales.read' },
  { slug: 'compras', label: 'Compras', permission: 'purchasing.read' },
  { slug: 'almacen', label: 'Almacén', permission: 'inventory.read' },
  { slug: 'facturacion', label: 'Facturación', permission: 'invoicing.read' },
  { slug: 'rrhh', label: 'RRHH', permission: null },
  { slug: 'incidencias', label: 'Incidencias', permission: null },
  { slug: 'tareas', label: 'Tareas', permission: null },
  { slug: 'estadisticas', label: 'Estadísticas', permission: 'stats.read' },
  { slug: 'ajustes', label: 'Ajustes', permission: 'members.read' },
] as const;

export type ModuleSlug = (typeof MODULES)[number]['slug'];

export const moduleLabel = (slug: string) => MODULES.find((m) => m.slug === slug)?.label;
