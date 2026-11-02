import { describe, expect, it } from 'vitest';
import { detectPack } from './pack-detect';

describe('formato de compra a partir del nombre', () => {
  it.each([
    ['Agua mineral 50 cl (caja 24)', { purchaseUnit: 'caja', size: 24, stockUnit: 'ud' }],
    ['Leche entera pack de 6', { purchaseUnit: 'pack', size: 6, stockUnit: 'ud' }],
    ['Cerveza tercio 24x33cl', { purchaseUnit: 'caja', size: 24, stockUnit: 'ud' }],
    ['Aceite de girasol garrafa 5 l', { purchaseUnit: 'garrafa', size: 5, stockUnit: 'l' }],
    ['Tónica CJ 24', { purchaseUnit: 'caja', size: 24, stockUnit: 'ud' }],
  ])('%s', (name, expected) => {
    expect(detectPack(name)).toEqual(expected);
  });

  it('no inventa formatos', () => {
    expect(detectPack('Ginebra 70 cl')).toBeNull();
    expect(detectPack('Caja registradora')).toBeNull();
    expect(detectPack('Caja de 1')).toBeNull();
  });
});
