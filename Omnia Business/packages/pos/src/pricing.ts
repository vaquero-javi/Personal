/**
 * Importes del ticket con la misma aritmética que Postgres en `invoice_lines`:
 *
 *   base = round(cantidad × precio × (1 − dto/100), 2)
 *   cuota = round(base × tipo/100, 2)
 *
 * Todo en enteros (BigInt) a partir del texto decimal: ni un céntimo de
 * diferencia entre lo que ve el camarero y lo que se emite.
 */

export interface PricedLine {
  quantity: string;
  /** Sin impuestos, hasta 4 decimales. */
  unitPrice: string;
  taxRate: string;
  discountPct: string;
}

export interface LineAmounts {
  base: string;
  tax: string;
  total: string;
}

/** «12.5» con escala 4 → 125000n. */
function scaled(value: string, scale: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Decimal no válido: ${value}`);
  const [, sign, int, frac = ''] = match;
  if (frac.length > scale) throw new Error(`Más de ${scale} decimales: ${value}`);
  const units = BigInt(int! + frac.padEnd(scale, '0'));
  return sign ? -units : units;
}

/** División entera con redondeo «mitad hacia fuera del cero», como `round()` de Postgres. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return negative ? -q : q;
}

function cents(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const text = abs.toString().padStart(3, '0');
  return `${negative ? '-' : ''}${text.slice(0, -2)}.${text.slice(-2)}`;
}

export function lineAmounts(line: PricedLine): LineAmounts {
  const q = scaled(line.quantity, 4);
  const u = scaled(line.unitPrice, 4);
  const d = scaled(line.discountPct, 2);
  const t = scaled(line.taxRate, 2);
  // q·u·(1 − d/100) en céntimos: (q/1e4)(u/1e4)((1e4 − d)/1e4)·100
  const base = divRound(q * u * (10_000n - d), 10_000_000_000n);
  // base·t/100 en céntimos: (base/100)(t/100)/100·100
  const tax = divRound(base * t, 10_000n);
  return { base: cents(base), tax: cents(tax), total: cents(base + tax) };
}

export function sumAmounts(amounts: LineAmounts[]): LineAmounts {
  let base = 0n;
  let tax = 0n;
  for (const a of amounts) {
    base += scaled(a.base, 2);
    tax += scaled(a.tax, 2);
  }
  return { base: cents(base), tax: cents(tax), total: cents(base + tax) };
}

/** Precio sin impuestos a partir del PVP: 4 decimales, como `unit_price`. */
export function netFromGross(pvp: string, taxRate: string): string {
  const p = scaled(pvp, 4);
  const t = scaled(taxRate, 2);
  const units = divRound(p * 10_000n, 10_000n + t);
  const text = units.toString().padStart(5, '0');
  return `${text.slice(0, -4)}.${text.slice(-4)}`;
}

export interface TicketSourceLine extends PricedLine {
  itemId: string;
  description: string;
}

export interface TicketLine extends TicketSourceLine, LineAmounts {}

/**
 * Agrupa las consumiciones de la cuenta en líneas de ticket. Si agrupar
 * cambia el total por redondeo (3 cañas de 3,50 € al 10 % darían 10,51 €),
 * esa consumición va en líneas de una unidad para que el ticket cuadre con
 * la carta.
 */
export function buildTicketLines(lines: readonly TicketSourceLine[]): TicketLine[] {
  const groups = new Map<string, TicketSourceLine & { quantityUnits: bigint }>();
  for (const l of lines) {
    const key = [l.itemId, l.description, scaled(l.unitPrice, 4), scaled(l.taxRate, 2), scaled(l.discountPct, 2)].join('|');
    const group = groups.get(key);
    if (group) group.quantityUnits += scaled(l.quantity, 4);
    else groups.set(key, { ...l, quantityUnits: scaled(l.quantity, 4) });
  }

  const out: TicketLine[] = [];
  for (const { quantityUnits, ...g } of groups.values()) {
    const quantity = (Number(quantityUnits) / 10_000).toString();
    const grouped = { ...g, quantity };
    const amounts = lineAmounts(grouped);
    const wholeUnits = quantityUnits % 10_000n === 0n ? quantityUnits / 10_000n : null;
    if (wholeUnits !== null && wholeUnits > 1n) {
      const one = lineAmounts({ ...g, quantity: '1' });
      if (scaled(amounts.total, 2) !== scaled(one.total, 2) * wholeUnits) {
        for (let i = 0n; i < wholeUnits; i++) out.push({ ...g, quantity: '1', ...one });
        continue;
      }
    }
    out.push({ ...grouped, ...amounts });
  }
  return out;
}
