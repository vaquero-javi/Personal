import { z } from 'zod';

type Sign = 'any' | 'positive' | 'non-negative';

/**
 * Importes y cantidades viajan como texto decimal ("12.5000") de punta a punta:
 * Postgres devuelve `numeric` como string y así nunca pasan por coma flotante.
 * Acepta number en la entrada (formularios, JSON) y lo normaliza a string;
 * admite la coma decimal española («0,62» → «0.62»).
 */
export function decimalString({ scale = 4, sign = 'any' }: { scale?: number; sign?: Sign } = {}) {
  const pattern = new RegExp(`^-?\\d{1,14}(\\.\\d{1,${scale}})?$`);
  return z
    .union([z.string(), z.number()])
    .transform((value) => (typeof value === 'number' ? String(value) : value.trim().replace(/\s/g, '').replace(',', '.')))
    .pipe(z.string().regex(pattern, `Debe ser un número con hasta ${scale} decimales`))
    .refine((value) => sign === 'any' || !value.startsWith('-'), 'No puede ser negativo')
    .refine((value) => sign !== 'positive' || /[1-9]/.test(value), 'Debe ser mayor que cero');
}
