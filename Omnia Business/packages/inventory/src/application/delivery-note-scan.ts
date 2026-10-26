import { z } from 'zod';

/**
 * Lectura de un albarán a partir de una foto. El lector (un modelo de visión,
 * fuera de este paquete) devuelve lo que pone el papel tal cual; aquí se
 * empareja con los proveedores y artículos de la sociedad. El resultado solo
 * rellena el formulario: siempre lo revisa una persona antes de guardarlo.
 */
export const DeliveryNoteExtraction = z.object({
  isDeliveryNote: z.boolean().describe('false si la imagen no es un albarán o no se puede leer'),
  supplierName: z.string().nullable().describe('Razón social del proveedor que emite el albarán'),
  supplierTaxId: z.string().nullable().describe('NIF/CIF del proveedor emisor, no el del cliente'),
  deliveryNoteNumber: z.string().nullable().describe('Número del albarán tal como aparece'),
  date: z.string().nullable().describe('Fecha del albarán en formato AAAA-MM-DD'),
  lines: z.array(
    z.object({
      reference: z.string().nullable().describe('Referencia o código de artículo del proveedor'),
      barcode: z.string().nullable().describe('Código EAN si aparece'),
      description: z.string(),
      quantity: z.number().describe('Unidades servidas (no las pedidas si difieren)'),
      unitPrice: z.number().nullable().describe('Precio unitario sin IVA; null si el albarán no lleva precios'),
      discountPct: z.number().nullable(),
    }),
  ),
});
export type DeliveryNoteExtraction = z.infer<typeof DeliveryNoteExtraction>;

export type MatchQuality = 'exact' | 'probable' | 'none';

export interface ScannedLine {
  itemId: string | null;
  match: MatchQuality;
  /** Lo que pone el papel, para que quien revisa compare. */
  read: string;
  quantity: string;
  unitCost: string;
}

export interface DeliveryNoteScan {
  supplierId: string | null;
  supplierMatch: MatchQuality;
  supplierRead: string | null;
  deliveryNoteNumber: string | null;
  date: string | null;
  lines: ScannedLine[];
  warnings: string[];
}

export interface ScanCatalog {
  suppliers: { id: string; legalName: string; taxId: string | null }[];
  items: { id: string; sku: string; barcode: string | null; name: string }[];
}

const STOP = new Set(['s', 'l', 'a', 'sl', 'sa', 'slu', 'sau', 'scl', 'cb', 'de', 'del', 'la', 'el', 'y', 'para', 'con', 'en', 'x']);
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const tokens = (s: string) => new Set(fold(s).split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t)));
const compact = (s: string) => fold(s).replace(/[^a-z0-9]/g, '');
export const normalizeTaxId = (s: string) => compact(s).toUpperCase().replace(/^ES(?=[A-Z0-9]{9}$)/, '');

/** Coeficiente de Dice sobre palabras: 1 = mismas palabras. */
export function similarity(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

const decimal = (n: number, scale: number) => Number(n.toFixed(scale)).toString().replace('.', ',');

export function matchDeliveryNote(read: DeliveryNoteExtraction, catalog: ScanCatalog): DeliveryNoteScan {
  const warnings: string[] = [];

  let supplierId: string | null = null;
  let supplierMatch: MatchQuality = 'none';
  const taxId = read.supplierTaxId ? normalizeTaxId(read.supplierTaxId) : null;
  const byTax = taxId ? catalog.suppliers.find((s) => s.taxId && normalizeTaxId(s.taxId) === taxId) : undefined;
  if (byTax) {
    supplierId = byTax.id;
    supplierMatch = 'exact';
  } else if (read.supplierName) {
    const best = catalog.suppliers
      .map((s) => ({ s, score: similarity(read.supplierName!, s.legalName) }))
      .sort((x, y) => y.score - x.score)[0];
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
    .filter((l) => l.quantity > 0)
    .map((l): ScannedLine => {
      let item = (l.barcode && byBarcode.get(compact(l.barcode))) || (l.reference && (bySku.get(compact(l.reference)) ?? byBarcode.get(compact(l.reference)))) || undefined;
      let match: MatchQuality = item ? 'exact' : 'none';
      if (!item) {
        const best = catalog.items
          .map((i) => ({ i, score: similarity(l.description, i.name) }))
          .sort((x, y) => y.score - x.score)[0];
        if (best && best.score >= 0.5) {
          item = best.i;
          match = 'probable';
        }
      }
      const cost = l.unitPrice === null ? 0 : l.unitPrice * (1 - (l.discountPct ?? 0) / 100);
      return {
        itemId: item?.id ?? null,
        match,
        read: [l.reference, l.description].filter(Boolean).join(' · '),
        quantity: decimal(l.quantity, 4),
        unitCost: l.unitPrice === null ? '' : decimal(cost, 4),
      };
    });

  const unmatched = lines.filter((l) => !l.itemId).length;
  if (unmatched) warnings.push(`${unmatched === 1 ? 'Una línea no corresponde' : `${unmatched} líneas no corresponden`} a ningún artículo: elígelo a mano o dalo de alta.`);
  if (read.lines.some((l) => l.unitPrice === null)) warnings.push('El albarán no trae precios en algunas líneas: indica el coste.');

  return { supplierId, supplierMatch, supplierRead, deliveryNoteNumber: read.deliveryNoteNumber, date: read.date, lines, warnings };
}
