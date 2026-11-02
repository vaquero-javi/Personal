import { describe, expect, it } from 'vitest';
import { buildTicketLines, lineAmounts, netFromGross, sumAmounts } from './pricing';

const line = (itemId: string, pvp: string, quantity = '1', discountPct = '0', taxRate = '10') => ({
  itemId,
  description: itemId,
  quantity,
  unitPrice: netFromGross(pvp, taxRate),
  taxRate,
  discountPct,
});

describe('importes de línea (misma aritmética que Postgres)', () => {
  it('redondea la base y la cuota por línea', () => {
    expect(lineAmounts({ quantity: '1', unitPrice: '7.2727', taxRate: '10', discountPct: '0' })).toEqual({ base: '7.27', tax: '0.73', total: '8.00' });
  });

  it('redondea la mitad hacia fuera del cero', () => {
    // 9.5454 → 9.55; 0.955 → 0.96
    expect(lineAmounts({ quantity: '3', unitPrice: '3.1818', taxRate: '10', discountPct: '0' })).toEqual({ base: '9.55', tax: '0.96', total: '10.51' });
  });

  it('aplica el descuento antes de redondear', () => {
    expect(lineAmounts({ quantity: '2', unitPrice: '10', taxRate: '21', discountPct: '15' })).toEqual({ base: '17.00', tax: '3.57', total: '20.57' });
  });

  it('suma importes sin coma flotante', () => {
    expect(sumAmounts([{ base: '0.10', tax: '0.01', total: '0.11' }, { base: '0.20', tax: '0.02', total: '0.22' }]).total).toBe('0.33');
  });
});

describe('precio sin impuestos desde el PVP', () => {
  it('deja 4 decimales', () => {
    expect(netFromGross('8', '10')).toBe('7.2727');
    expect(netFromGross('2.5', '10')).toBe('2.2727');
    expect(netFromGross('12.10', '21')).toBe('10.0000');
  });
});

describe('líneas del ticket', () => {
  it('agrupa consumiciones iguales', () => {
    const out = buildTicketLines([line('cafe', '1.5'), line('cafe', '1.5'), line('gin', '8')]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ itemId: 'cafe', quantity: '2', total: '3.00' });
  });

  it('dos gin-tonics de 8 € suman 16 € aunque agrupados darían 16,01 €', () => {
    const out = buildTicketLines([line('gin', '8'), line('gin', '8')]);
    expect(out.map((l) => l.quantity)).toEqual(['1', '1']);
    expect(sumAmounts(out).total).toBe('16.00');
  });

  it('separa en unidades cuando agrupar descuadraría la carta', () => {
    const out = buildTicketLines([line('cana', '3.5', '3')]);
    expect(out).toHaveLength(3);
    expect(sumAmounts(out).total).toBe('10.50');
  });

  it('no agrupa precios ni descuentos distintos', () => {
    const out = buildTicketLines([line('gin', '8'), line('gin', '8', '1', '50')]);
    expect(out).toHaveLength(2);
    expect(sumAmounts(out).total).toBe('12.00');
  });
});
