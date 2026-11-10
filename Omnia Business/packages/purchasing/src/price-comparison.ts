import { z } from 'zod';
import { normalizeTaxId, similarity, type MatchQuality } from '@omnia/inventory';

/**
 * Comparador de precios de compra: una factura de proveedor frente a la
 * anterior de ese mismo proveedor, precio por unidad. Cada artículo queda como
 * «sube», «baja», «igual» o «nuevo» (no venía en la anterior); lo que venía
 * antes y ahora no, se lista aparte. Aquí también está la lectura de una
 * factura desde una foto, que solo rellena el formulario de registro.
 */

export const SupplierInvoiceExtraction = z.object({
  isInvoice: z.boolean().describe('false si el documento no es una factura o no se puede leer'),
  supplierName: z.string().nullable().describe('Razón social del proveedor que emite la factura'),
  supplierTaxId: z.string().nullable().describe('NIF/CIF del proveedor emisor, no el del cliente'),
  invoiceNumber: z.string().nullable().describe('Número de la factura tal como aparece'),
  date: z.string().nullable().describe('Fecha de expedición en formato AAAA-MM-DD'),
  lines: z.array(
    z.object({
      reference: z.string().nullable().describe('Referencia o código de artículo del proveedor'),
      barcode: z.string().nullable().describe('Código EAN si aparece'),
      description: z.string(),
      quantity: z.number().describe('Cantidad facturada'),
      unitPrice: z.number().nullable().describe('Precio unitario sin IVA y antes de descuento'),
      discountPct: z.number().nullable().describe('Descuento de la línea en %'),
      taxRate: z.number().nullable().describe('Tipo de IVA de la línea en % (21, 10, 4, 0)'),
    }),
  ),
});
export type SupplierInvoiceExtraction = z.infer<typeof SupplierInvoiceExtraction>;

/** Línea de factura, tal como se compara (precios como texto decimal con punto). */
export interface PriceLine {
  itemId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
}

export type PriceTrend = 'up' | 'down' | 'same' | 'new';

export interface PriceComparisonRow {
  itemId: string | null;
  description: string;
  quantity: string;
  /** Precio unitario neto (con el descuento de la línea aplicado). */
  price: string;
  previousPrice: string | null;
  previousDescription: string | null;
  /** Diferencia en € por unidad y en %, null si es nuevo. */
  diff: string | null;
  diffPct: number | null;
  trend: PriceTrend;
  /** Efecto en esta factura: (precio nuevo − anterior) × cantidad. */
  impact: string | null;
}

export interface PreviousInvoiceRef {
  id: string;
  fullNumber: string;
  issueDate: string;
}

export interface PriceComparison {
  previous: PreviousInvoiceRef | null;
  rows: PriceComparisonRow[];
  /** Artículos de la factura anterior que no vienen en esta. */
  missing: { description: string; price: string }[];
  counts: Record<PriceTrend, number>;
  /** Suma de los impactos: lo que esta factura cuesta de más (o de menos) por los cambios de precio. */
  impact: string;
}

/** Por debajo de medio céntimo por unidad se considera el mismo precio. */
const TOLERANCE = 0.005;
const SAME_DESCRIPTION = 0.6;

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const net = (l: PriceLine) => Number(l.unitPrice) * (1 - Number(l.discountPct || 0) / 100);
const money = (n: number, scale = 4) => Number(n.toFixed(scale)).toString();

/**
 * Empareja cada línea nueva con una de la anterior: por artículo, por
 * descripción idéntica (sin acentos ni signos) o por la más parecida. Cada
 * línea anterior se usa una sola vez.
 */
export function comparePrices(lines: readonly PriceLine[], previousLines: readonly PriceLine[], previous: PreviousInvoiceRef | null): PriceComparison {
  const used = new Set<number>();
  const take = (i: number) => {
    if (i < 0 || used.has(i)) return undefined;
    used.add(i);
    return previousLines[i];
  };
  const free = (pred: (p: PriceLine) => boolean) => previousLines.findIndex((p, i) => !used.has(i) && pred(p));

  const findPrevious = (l: PriceLine) => {
    if (l.itemId) {
      const hit = take(free((p) => p.itemId === l.itemId));
      if (hit) return hit;
    }
    const key = fold(l.description);
    const exact = take(free((p) => !(l.itemId && p.itemId && p.itemId !== l.itemId) && fold(p.description) === key));
    if (exact) return exact;
    let best = -1;
    let bestScore = SAME_DESCRIPTION;
    previousLines.forEach((p, i) => {
      if (used.has(i) || (l.itemId && p.itemId && p.itemId !== l.itemId)) return;
      const score = similarity(l.description, p.description);
      if (score >= bestScore) {
        best = i;
        bestScore = score;
      }
    });
    return take(best);
  };

  const counts: Record<PriceTrend, number> = { up: 0, down: 0, same: 0, new: 0 };
  let impact = 0;
  const rows = lines
    .filter((l) => Number(l.quantity) !== 0)
    .map((l): PriceComparisonRow => {
      const price = net(l);
      const before = findPrevious(l);
      if (!before) {
        counts.new++;
        return { itemId: l.itemId, description: l.description, quantity: l.quantity, price: money(price), previousPrice: null, previousDescription: null, diff: null, diffPct: null, trend: 'new', impact: null };
      }
      const old = net(before);
      const diff = price - old;
      const trend: PriceTrend = Math.abs(diff) < TOLERANCE ? 'same' : diff > 0 ? 'up' : 'down';
      counts[trend]++;
      const lineImpact = trend === 'same' ? 0 : diff * Number(l.quantity);
      impact += lineImpact;
      return {
        itemId: l.itemId,
        description: l.description,
        quantity: l.quantity,
        price: money(price),
        previousPrice: money(old),
        previousDescription: fold(before.description) === fold(l.description) ? null : before.description,
        diff: trend === 'same' ? '0' : money(diff),
        diffPct: trend === 'same' || old === 0 ? (trend === 'same' ? 0 : null) : Math.round((diff / old) * 1000) / 10,
        trend,
        impact: money(lineImpact, 2),
      };
    });

  const missing = previousLines.filter((_, i) => !used.has(i)).map((p) => ({ description: p.description, price: money(net(p)) }));
  return { previous, rows, missing, counts, impact: money(impact, 2) };
}

export interface ScannedInvoiceLine {
  itemId: string | null;
  match: MatchQuality;
  /** Lo que pone el papel, para que quien revisa compare. */
  read: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  taxRate: string;
}

export interface SupplierInvoiceScan {
  supplierId: string | null;
  supplierMatch: MatchQuality;
  supplierRead: string | null;
  invoiceNumber: string | null;
  date: string | null;
  lines: ScannedInvoiceLine[];
  warnings: string[];
}

export interface InvoiceScanCatalog {
  suppliers: { id: string; legalName: string; taxId: string | null }[];
  items: { id: string; sku: string; barcode: string | null; name: string; taxRate: string }[];
}

const compact = (s: string) => fold(s).replace(/ /g, '');
const decimal = (n: number, scale: number) => Number(n.toFixed(scale)).toString();

/** Empareja la lectura de la factura con los proveedores y artículos de la sociedad. */
export function matchSupplierInvoice(read: SupplierInvoiceExtraction, catalog: InvoiceScanCatalog): SupplierInvoiceScan {
  const warnings: string[] = [];

  let supplierId: string | null = null;
  let supplierMatch: MatchQuality = 'none';
  const taxId = read.supplierTaxId ? normalizeTaxId(read.supplierTaxId) : null;
  const byTax = taxId ? catalog.suppliers.find((s) => s.taxId && normalizeTaxId(s.taxId) === taxId) : undefined;
  if (byTax) {
    supplierId = byTax.id;
    supplierMatch = 'exact';
  } else if (read.supplierName) {
    const best = catalog.suppliers.map((s) => ({ s, score: similarity(read.supplierName!, s.legalName) })).sort((x, y) => y.score - x.score)[0];
    if (best && best.score >= 0.5) {
      supplierId = best.s.id;
      supplierMatch = 'probable';
    }
  }
  const supplierRead = [read.supplierName, read.supplierTaxId].filter(Boolean).join(' · ') || null;
  if (!supplierId) warnings.push(supplierRead ? `No hay ningún proveedor dado de alta que coincida con «${supplierRead}».` : 'No se ha podido leer el proveedor.');

  const bySku = new Map(catalog.items.map((i) => [compact(i.sku), i]));
  const byBarcode = new Map(catalog.items.filter((i) => i.barcode).map((i) => [compact(i.barcode!), i]));
  const lines = read.lines
    .filter((l) => l.quantity !== 0 && l.unitPrice !== null)
    .map((l): ScannedInvoiceLine => {
      let item = (l.barcode && byBarcode.get(compact(l.barcode))) || (l.reference && (bySku.get(compact(l.reference)) ?? byBarcode.get(compact(l.reference)))) || undefined;
      let match: MatchQuality = item ? 'exact' : 'none';
      if (!item) {
        const best = catalog.items.map((i) => ({ i, score: similarity(l.description, i.name) })).sort((x, y) => y.score - x.score)[0];
        if (best && best.score >= 0.5) {
          item = best.i;
          match = 'probable';
        }
      }
      return {
        itemId: item?.id ?? null,
        match,
        read: [l.reference, l.description].filter(Boolean).join(' · '),
        description: l.description,
        quantity: decimal(l.quantity, 4),
        unitPrice: decimal(l.unitPrice!, 4),
        discountPct: decimal(l.discountPct ?? 0, 2),
        taxRate: decimal(l.taxRate ?? Number(item?.taxRate ?? 21), 2),
      };
    });

  const skipped = read.lines.filter((l) => l.quantity !== 0 && l.unitPrice === null).length;
  if (skipped) warnings.push(`${skipped === 1 ? 'Una línea no trae' : `${skipped} líneas no traen`} precio y no se compara${skipped === 1 ? '' : 'n'}.`);
  if (!read.invoiceNumber) warnings.push('No se ha leído el número de factura.');
  if (!read.date) warnings.push('No se ha leído la fecha de la factura.');

  return { supplierId, supplierMatch, supplierRead, invoiceNumber: read.invoiceNumber, date: read.date, lines, warnings };
}
