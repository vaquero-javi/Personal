// Códigos de módulo que usa la web (catálogo en public.features, migración 0032).
// Constantes para que un error tipográfico rompa en compilación y no en producción.
export const FEATURES = {
  base: 'base',
  inventory: 'inventory',
  invoicing: 'invoicing',
  hr: 'hr',
  hrShifts: 'hr.shifts',
  hrPayroll: 'hr.payroll',
  tasks: 'tasks',
  incidents: 'incidents',
  sales: 'sales',
  salesPriceLists: 'sales.price_lists',
  salesPos: 'sales.pos',
  staffCards: 'sales.pos.staff_cards',
  purchasing: 'purchasing',
  receivedInvoices: 'purchasing.received_invoices',
  priceComparison: 'purchasing.price_comparison',
  stats: 'stats',
  messages: 'messages',
} as const;

export type WebFeature = (typeof FEATURES)[keyof typeof FEATURES];

export const STAFF_CARDS = FEATURES.staffCards;
