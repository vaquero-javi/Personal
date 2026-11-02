/**
 * Formato de compra a partir del nombre del artículo, para no tener que
 * rellenarlo a mano:
 *   «Agua mineral (caja 24)»      → caja de 24 ud
 *   «Cerveza tercio 24x33cl»      → caja de 24 ud
 *   «Aceite de girasol garrafa 5 l» → garrafa de 5 l
 *   «Leche pack de 6»             → pack de 6 ud
 */
const CONTAINERS: Record<string, string> = {
  caja: 'caja', cj: 'caja', cja: 'caja', pack: 'pack', pk: 'pack', paquete: 'paquete', bandeja: 'bandeja', fardo: 'fardo',
  bolsa: 'bolsa', saco: 'saco', estuche: 'estuche', lote: 'lote', garrafa: 'garrafa', barril: 'barril', bidon: 'bidón', bidón: 'bidón',
};
const UNITS: Record<string, string> = { ud: 'ud', uds: 'ud', u: 'ud', unidades: 'ud', l: 'l', litros: 'l', kg: 'kg', kilos: 'kg' };

export interface DetectedPack {
  purchaseUnit: string;
  size: number;
  stockUnit: string;
}

export function detectPack(name: string): DetectedPack | null {
  const text = name.toLowerCase();
  const container = /\b(caja|cja|cj|pack|pk|paquete|bandeja|fardo|bolsa|saco|estuche|lote|garrafa|barril|bid[oó]n)\.?\s*(?:de\s+)?(\d+(?:[.,]\d+)?)\s*(uds?|u|unidades|l|litros|kg|kilos)?\b/.exec(text);
  if (container) {
    const size = Number(container[2]!.replace(',', '.'));
    if (size > 1) return { purchaseUnit: CONTAINERS[container[1]!] ?? container[1]!, size, stockUnit: UNITS[container[3] ?? 'ud'] ?? 'ud' };
  }
  // «24x33cl», «6 x 1 l»: N envases por caja.
  const multi = /\b(\d{1,3})\s*[x×]\s*\d/.exec(text);
  if (multi && Number(multi[1]) > 1) return { purchaseUnit: 'caja', size: Number(multi[1]), stockUnit: 'ud' };
  return null;
}
