import { describe, expect, it } from 'vitest';
import { comparePrices, matchSupplierInvoice, type PriceLine, type SupplierInvoiceExtraction } from './price-comparison';

const line = (description: string, quantity: string, unitPrice: string, over: Partial<PriceLine> = {}): PriceLine => ({
  itemId: null,
  description,
  quantity,
  unitPrice,
  discountPct: '0',
  ...over,
});
const prev = { id: 'p1', fullNumber: 'F-100', issueDate: '2026-10-01' };

describe('comparePrices', () => {
  it('compara el precio por unidad, no el importe de la línea', () => {
    // Antes 2 cajas a 18 €, ahora 1 caja a 18 €: mismo precio aunque el importe sea la mitad.
    const r = comparePrices([line('Coca-Cola 33 cl caja 24', '1', '18')], [line('Coca-Cola 33 cl caja 24', '2', '18')], prev);
    expect(r.rows[0]).toMatchObject({ trend: 'same', price: '18', previousPrice: '18', impact: '0' });
    expect(r.counts).toEqual({ up: 0, down: 0, same: 1, new: 0 });
  });

  it('marca subidas, bajadas y nuevos, con el % y el efecto en la factura', () => {
    const r = comparePrices(
      [line('Cerveza barril 30 l', '3', '95', { itemId: 'i1' }), line('Tónica 20 cl', '24', '0.55'), line('Limones kg', '5', '2.1')],
      [line('Barril cerveza 30L', '1', '90', { itemId: 'i1' }), line('TONICA 20 CL', '48', '0.6'), line('Hielo saco', '10', '1.2')],
      prev,
    );
    expect(r.rows.map((x) => x.trend)).toEqual(['up', 'down', 'new']);
    expect(r.rows[0]).toMatchObject({ diff: '5', diffPct: 5.6, impact: '15' });
    expect(r.rows[1]).toMatchObject({ previousPrice: '0.6', diffPct: -8.3, impact: '-1.2' });
    expect(r.missing).toEqual([{ description: 'Hielo saco', price: '1.2' }]);
    expect(r.impact).toBe('13.8');
  });

  it('aplica el descuento de la línea y tolera medio céntimo', () => {
    const r = comparePrices([line('Ginebra 70 cl', '6', '12.5', { discountPct: '10' })], [line('Ginebra 70 cl', '6', '11.252')], prev);
    expect(r.rows[0]).toMatchObject({ price: '11.25', trend: 'same' });
  });

  it('sin factura anterior todo es nuevo', () => {
    const r = comparePrices([line('Ron', '1', '15')], [], null);
    expect(r.previous).toBeNull();
    expect(r.counts.new).toBe(1);
  });

  it('no empareja dos artículos distintos aunque se parezca el nombre', () => {
    const r = comparePrices([line('Agua 50 cl', '1', '0.3', { itemId: 'a' })], [line('Agua 50 cl', '1', '0.2', { itemId: 'b' })], prev);
    expect(r.rows[0]!.trend).toBe('new');
  });
});

describe('matchSupplierInvoice', () => {
  const read: SupplierInvoiceExtraction = {
    isInvoice: true,
    supplierName: 'Distribuciones Bebidas del Sur SL',
    supplierTaxId: 'ES-B12345678',
    invoiceNumber: 'FV-2026-881',
    date: '2026-11-02',
    lines: [
      { reference: 'CC33', barcode: null, description: 'COCA COLA LATA 33CL', quantity: 2, unitPrice: 0.62, discountPct: null, taxRate: 10 },
      { reference: null, barcode: null, description: 'Portes', quantity: 1, unitPrice: null, discountPct: null, taxRate: null },
    ],
  };
  it('reconoce proveedor por NIF y artículo por referencia', () => {
    const scan = matchSupplierInvoice(read, {
      suppliers: [{ id: 's1', legalName: 'Bebidas del Sur', taxId: 'B12345678' }],
      items: [{ id: 'i1', sku: 'CC33', barcode: null, name: 'Coca-Cola lata', taxRate: '10' }],
    });
    expect(scan).toMatchObject({ supplierId: 's1', supplierMatch: 'exact', invoiceNumber: 'FV-2026-881' });
    expect(scan.lines).toEqual([expect.objectContaining({ itemId: 'i1', match: 'exact', unitPrice: '0.62', quantity: '2', taxRate: '10' })]);
    expect(scan.warnings).toHaveLength(1);
  });
});
