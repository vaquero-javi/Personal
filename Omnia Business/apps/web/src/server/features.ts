// Códigos de módulo que usa la web (catálogo en public.features, migración 0032).
// Constantes para que un error tipográfico rompa en compilación y no en producción.
export const FEATURES = {
  base: 'base',
  parties: 'base.parties',
  members: 'base.members',
  roles: 'base.roles',
  customFields: 'base.custom_fields',
  establishments: 'base.establishments',
  inventory: 'inventory',
  goodsReceipts: 'inventory.goods_receipts',
  stockMovements: 'inventory.movements',
  warehouses: 'inventory.warehouses',
  invoicing: 'invoicing',
  verifactu: 'invoicing.verifactu',
  invoiceSeries: 'invoicing.series',
  hr: 'hr',
  hrTimeLog: 'hr.time_log',
  hrLeave: 'hr.leave',
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
  statsComparison: 'stats.comparison',
  statsIncome: 'stats.income_statement',
  statsFinancial: 'stats.financial_statements',
  statsReports: 'stats.reports',
  statsEstablishments: 'stats.establishments',
  messages: 'messages',
} as const;

export type WebFeature = (typeof FEATURES)[keyof typeof FEATURES];

export const STAFF_CARDS = FEATURES.staffCards;
