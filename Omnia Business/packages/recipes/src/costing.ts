import type { CostedProduct } from './index';

// Cálculos puros: se usan también en el navegador.

/** Coste de materia prima sobre precio sin impuestos, en %. Null si no hay precio. */
export function foodCostPct(p: Pick<CostedProduct, 'unitCost' | 'netPrice'>): number | null {
  if (p.unitCost === null || p.netPrice === null || Number(p.netPrice) <= 0) return null;
  return (Number(p.unitCost) / Number(p.netPrice)) * 100;
}

/** Margen bruto por unidad: precio sin impuestos menos coste. */
export function grossMargin(p: Pick<CostedProduct, 'unitCost' | 'netPrice'>): number | null {
  if (p.unitCost === null || p.netPrice === null) return null;
  return Number(p.netPrice) - Number(p.unitCost);
}
