import type { MonthFigures } from '@omnia/stats/types';
import { formatMonth } from '@/lib/format';

/** Fila de un informe de gestión (un mes o un trimestre). */
export interface ReportRow {
  label: string;
  invoiced: number;
  vat: number;
  invoices: number;
  collected: number;
  expenses: number;
  net: number;
  paid: number;
  liquidity: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Agrupa los meses en filas de informe (por mes o por trimestre) más la fila de totales. */
export function buildReport(months: MonthFigures[], groupBy: 'mes' | 'trimestre'): { rows: ReportRow[]; total: ReportRow } {
  const groups = new Map<string, MonthFigures[]>();
  for (const m of months) {
    const key = groupBy === 'mes' ? formatMonth(m.month) : `${Math.floor((Number(m.month.slice(5, 7)) - 1) / 3) + 1}.º trimestre`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const row = (label: string, ms: MonthFigures[]): ReportRow => {
    const s = (f: (m: MonthFigures) => number) => round2(ms.reduce((t, m) => t + f(m), 0));
    const expenses = s((m) => m.suppliesBase + m.expensesBase + m.payrollNet);
    const paid = s((m) => m.paidOut + m.payrollNet);
    const collected = s((m) => m.collected);
    const invoiced = s((m) => m.salesBase);
    return {
      label,
      invoiced,
      vat: s((m) => m.salesTax),
      invoices: s((m) => m.invoicesCount),
      collected,
      expenses,
      net: round2(invoiced - expenses),
      paid,
      liquidity: round2(collected - paid),
    };
  };
  return { rows: [...groups].map(([label, ms]) => row(label, ms)), total: row('Total', months) };
}

export const REPORT_COLUMNS: { key: keyof Omit<ReportRow, 'label'>; label: string; money: boolean }[] = [
  { key: 'invoiced', label: 'Facturado (base)', money: true },
  { key: 'vat', label: 'IVA repercutido', money: true },
  { key: 'invoices', label: 'Nº facturas y tickets', money: false },
  { key: 'collected', label: 'Cobrado', money: true },
  { key: 'expenses', label: 'Gastos', money: true },
  { key: 'net', label: 'Neto', money: true },
  { key: 'paid', label: 'Pagado', money: true },
  { key: 'liquidity', label: 'Liquidez neta', money: true },
];
