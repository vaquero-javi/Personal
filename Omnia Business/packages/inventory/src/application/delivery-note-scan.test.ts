import { describe, expect, it } from 'vitest';
import { matchDeliveryNote, normalizeTaxId, type DeliveryNoteExtraction } from './delivery-note-scan';

const catalog = {
  suppliers: [
    { id: 's1', legalName: 'Tornillería Norte S.A.', taxId: 'A48112233' },
    { id: 's2', legalName: 'Adhesivos Levante S.L.', taxId: 'B46223344' },
  ],
  items: [
    { id: 'i1', sku: 'T-M6', barcode: '8412345000016', name: 'Tornillo hexagonal M6 x 40' },
    { id: 'i2', sku: 'SL-300', barcode: null, name: 'Silicona neutra 300 ml' },
    { id: 'i3', sku: 'CA-50', barcode: null, name: 'Cinta americana 50 m' },
  ],
};

const read = (over: Partial<DeliveryNoteExtraction> = {}): DeliveryNoteExtraction => ({
  isDeliveryNote: true,
  supplierName: 'TORNILLERIA NORTE SA',
  supplierTaxId: 'ES-A48112233',
  deliveryNoteNumber: 'AL-2026-0412',
  date: '2026-10-24',
  lines: [],
  ...over,
});

describe('lectura de albaranes', () => {
  it('normaliza el NIF (prefijo ES, guiones, minúsculas)', () => {
    expect(normalizeTaxId('es-a48112233')).toBe('A48112233');
    expect(normalizeTaxId('12345678-z')).toBe('12345678Z');
  });

  it('identifica al proveedor por NIF aunque el nombre venga distinto', () => {
    const scan = matchDeliveryNote(read({ supplierName: 'TN Suministros' }), catalog);
    expect(scan).toMatchObject({ supplierId: 's1', supplierMatch: 'exact' });
  });

  it('sin NIF, por parecido del nombre sin acentos ni forma jurídica', () => {
    const scan = matchDeliveryNote(read({ supplierTaxId: null, supplierName: 'ADHESIVOS LEVANTE, SL' }), catalog);
    expect(scan).toMatchObject({ supplierId: 's2', supplierMatch: 'probable' });
  });

  it('empareja líneas por código de barras, referencia y descripción, y calcula el coste con descuento', () => {
    const scan = matchDeliveryNote(
      read({
        lines: [
          { reference: null, barcode: '8412345000016', description: 'TORN HEX', quantity: 500, unitPrice: 0.4, discountPct: 10 },
          { reference: 'sl 300', barcode: null, description: 'Silicona', quantity: 24, unitPrice: 2.4, discountPct: null },
          { reference: 'X-99', barcode: null, description: 'Cinta americana gris 50m', quantity: 12, unitPrice: 2.9, discountPct: null },
          { reference: 'Z-1', barcode: null, description: 'Guantes de nitrilo', quantity: 3, unitPrice: 5, discountPct: null },
        ],
      }),
      catalog,
    );
    expect(scan.lines.map((l) => [l.itemId, l.match, l.quantity, l.unitCost])).toEqual([
      ['i1', 'exact', '500', '0,36'],
      ['i2', 'exact', '24', '2,4'],
      ['i3', 'probable', '12', '2,9'],
      [null, 'none', '3', '5'],
    ]);
    expect(scan.warnings).toEqual(['Una línea no corresponde a ningún artículo: elígelo a mano o dalo de alta.']);
  });

  it('avisa cuando no hay proveedor ni precios', () => {
    const scan = matchDeliveryNote(
      read({ supplierTaxId: 'B99999999', supplierName: 'Desconocido SL', lines: [{ reference: 'CA-50', barcode: null, description: 'Cinta', quantity: 5, unitPrice: null, discountPct: null }] }),
      catalog,
    );
    expect(scan.supplierId).toBeNull();
    expect(scan.lines[0]).toMatchObject({ itemId: 'i3', unitCost: '' });
    expect(scan.warnings).toHaveLength(2);
  });
});
