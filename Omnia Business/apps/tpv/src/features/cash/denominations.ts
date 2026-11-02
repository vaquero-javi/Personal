/** Billetes y monedas de euro, en céntimos (clave del detalle del arqueo). */
export const DENOMINATIONS = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

export const denominationLabel = (cents: number) =>
  cents >= 100 ? `${cents / 100} €` : `${cents} cént.`;

export const isBill = (cents: number) => cents >= 500;
