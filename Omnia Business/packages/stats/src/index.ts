import { z } from 'zod';
import { singleOrganization, type TenantContext } from '@omnia/core';
import { withTenant, type Sql } from '@omnia/db';

/** Cifras de un mes. Importes en euros, bases sin impuestos. */
export interface MonthFigures {
  month: string; // YYYY-MM-01
  salesBase: number;
  salesTax: number;
  posBase: number;
  invoicesCount: number;
  suppliesBase: number;
  expensesBase: number;
  purchasesTax: number;
  payrollNet: number;
  collected: number;
  paidOut: number;
}

/** Cuenta de resultados de un periodo (suma de meses). */
export interface Results {
  revenue: number;
  pos: number;
  supplies: number;
  grossMargin: number;
  payroll: number;
  otherExpenses: number;
  operatingResult: number;
  /** Resultado sobre facturación, en %; null sin facturación. */
  marginPct: number | null;
}

export interface Snapshot {
  receivable: number;
  receivableOverdue: number;
  payable: number;
  payableOverdue: number;
  inventory: number;
  cashInRegisters: number;
  vatOutput: number;
  vatInput: number;
  quarterStart: string;
  topCustomers: { name: string; base: number; invoices: number }[];
}

/** Cifras de un día (Estadísticas › Comparación). Importes con IVA salvo `base`. */
export interface DayFigures {
  day: string; // YYYY-MM-DD
  isToday: boolean;
  /** Hora actual (HH:MM, hora peninsular) en el momento de la consulta. */
  now: string;
  total: number;
  base: number;
  tax: number;
  /** Tickets y facturas emitidos. */
  count: number;
  posTotal: number;
  posCount: number;
  /** Vendido con fecha de ese día pero sin hora fiable (no entra en `hourly`). */
  untimedTotal: number;
  /** Vendido hasta `until` (si se pidió). */
  untilTotal: number | null;
  untilCount: number | null;
  /** Comensales de las cuentas del TPV cobradas ese día. */
  guests: number;
  cash: number;
  card: number;
  otherPayments: number;
  /** Solo hoy: cuentas abiertas en mesas y su importe aproximado (con IVA). */
  openTabs: number;
  openTotal: number;
  hourly: { hour: number; total: number; count: number }[];
}

const IsoDate = z.iso.date();
const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const num = (v: unknown) => Number(v ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function results(months: MonthFigures[]): Results {
  const sum = (k: keyof MonthFigures) => round2(months.reduce((t, m) => t + (m[k] as number), 0));
  const revenue = sum('salesBase');
  const supplies = sum('suppliesBase');
  const payroll = sum('payrollNet');
  const otherExpenses = sum('expensesBase');
  const grossMargin = round2(revenue - supplies);
  const operatingResult = round2(grossMargin - payroll - otherExpenses);
  return {
    revenue,
    pos: sum('posBase'),
    supplies,
    grossMargin,
    payroll,
    otherExpenses,
    operatingResult,
    marginPct: revenue !== 0 ? Math.round((operatingResult / revenue) * 1000) / 10 : null,
  };
}

/** Cifras de una empresa (negocio o local) en un periodo. `establishmentId` null = sin empresa asignada. */
export interface EstablishmentFigures {
  establishmentId: string | null;
  name: string | null;
  isActive: boolean;
  salesBase: number;
  posBase: number;
  tickets: number;
  b2bBase: number;
  stockValue: number;
  staff: number;
  shiftHours: number;
}

/** Gastos totales de un mes: compras, otros gastos y nóminas. */
export const monthExpenses = (m: MonthFigures) => round2(m.suppliesBase + m.expensesBase + m.payrollNet);
/** Caja que entra menos la que sale (cobros − pagos − nóminas). */
export const monthCashFlow = (m: MonthFigures) => round2(m.collected - m.paidOut - m.payrollNet);

/**
 * Estadísticas financieras. Todo pasa por app.stats_* (DEFINER), que exigen
 * stats.read y devuelven solo agregados.
 */
export function createStatsService(sql: Sql) {
  return {
    async monthly(ctx: TenantContext, from: string, to: string): Promise<MonthFigures[]> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const rows = await tx`select * from app.stats_monthly(${orgId}, ${IsoDate.parse(from)}, ${IsoDate.parse(to)})`;
        return rows.map((r) => ({
          month: r.month instanceof Date ? r.month.toISOString().slice(0, 10) : String(r.month),
          salesBase: num(r.sales_base),
          salesTax: num(r.sales_tax),
          posBase: num(r.pos_base),
          invoicesCount: num(r.invoices_count),
          suppliesBase: num(r.supplies_base),
          expensesBase: num(r.expenses_base),
          purchasesTax: num(r.purchases_tax),
          payrollNet: num(r.payroll_net),
          collected: num(r.collected),
          paidOut: num(r.paid_out),
        }));
      });
    },

    /** Comparativa por empresa (locales) de la sociedad entre dos fechas (incluidas). */
    async establishments(ctx: TenantContext, from: string, to: string): Promise<EstablishmentFigures[]> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const rows = await tx`select * from app.stats_establishments(${orgId}, ${IsoDate.parse(from)}, ${IsoDate.parse(to)})`;
        return rows.map((r) => ({
          establishmentId: (r.establishment_id as string | null) ?? null,
          name: (r.name as string | null) ?? null,
          isActive: r.is_active !== false,
          salesBase: num(r.sales_base),
          posBase: num(r.pos_base),
          tickets: num(r.tickets),
          b2bBase: num(r.b2b_base),
          stockValue: num(r.stock_value),
          staff: num(r.staff),
          shiftHours: num(r.shift_hours),
        }));
      });
    },

    /** Cifras de un día; con `until` (HH:MM), además lo vendido hasta esa hora. */
    async day(ctx: TenantContext, day: string, until?: string | null): Promise<DayFigures> {
      const orgId = singleOrganization(ctx);
      const cutoff = until ? Clock.parse(until) : null;
      return withTenant(sql, ctx, async (tx) => {
        const [row] = await tx<{ d: Record<string, unknown> }[]>`select app.stats_day(${orgId}, ${IsoDate.parse(day)}, ${cutoff}::time) as d`;
        const d = row!.d;
        return {
          day: String(d.day),
          isToday: Boolean(d.isToday),
          now: String(d.now),
          total: num(d.total),
          base: num(d.base),
          tax: num(d.tax),
          count: num(d.count),
          posTotal: num(d.posTotal),
          posCount: num(d.posCount),
          untimedTotal: num(d.untimedTotal),
          untilTotal: d.untilTotal == null ? null : num(d.untilTotal),
          untilCount: d.untilCount == null ? null : num(d.untilCount),
          guests: num(d.guests),
          cash: num(d.cash),
          card: num(d.card),
          otherPayments: num(d.otherPayments),
          openTabs: num(d.openTabs),
          openTotal: num(d.openTotal),
          hourly: ((d.hourly as { hour: unknown; total: unknown; count: unknown }[]) ?? []).map((h) => ({ hour: num(h.hour), total: num(h.total), count: num(h.count) })),
        };
      });
    },

    async snapshot(ctx: TenantContext): Promise<Snapshot> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [row] = await tx<{ s: Record<string, unknown> }[]>`select app.stats_snapshot(${orgId}) as s`;
        const s = row!.s;
        return {
          receivable: num(s.receivable),
          receivableOverdue: num(s.receivableOverdue),
          payable: num(s.payable),
          payableOverdue: num(s.payableOverdue),
          inventory: num(s.inventory),
          cashInRegisters: num(s.cashInRegisters),
          vatOutput: num(s.vatOutput),
          vatInput: num(s.vatInput),
          quarterStart: String(s.quarterStart),
          topCustomers: ((s.topCustomers as { name: string; base: unknown; invoices: unknown }[]) ?? []).map((c) => ({ name: c.name, base: num(c.base), invoices: num(c.invoices) })),
        };
      });
    },
  };
}

export type StatsService = ReturnType<typeof createStatsService>;
