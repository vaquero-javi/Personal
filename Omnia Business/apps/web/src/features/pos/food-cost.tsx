import { formatQty } from '@/lib/format';

/** Food cost: hasta 30 % sano, hasta 35 % vigilar, más es caro (referencia habitual en hostelería). */
export function FoodCost({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-ink-3">—</span>;
  const tone = pct <= 30 ? 'text-ok' : pct <= 35 ? 'text-warning' : 'text-danger';
  return <span className={`font-semibold ${tone}`}>{formatQty(pct.toFixed(1))} %</span>;
}
