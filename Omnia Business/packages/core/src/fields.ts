import { z } from 'zod';

// Esquemas de campo que aceptan lo que llega de un formulario HTML (todo texto,
// vacío = no informado) y de JSON. Los usan todos los módulos.

const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

export const requiredText = (max = 200, message = 'Obligatorio') =>
  z.string({ error: message }).trim().min(1, message).max(max);

export const optionalText = (max = 2000) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

export const optionalUuid = () => z.preprocess(blankToUndefined, z.uuid().optional());

export const isoDate = (message = 'Fecha no válida') => z.iso.date({ error: message });
export const optionalIsoDate = () => z.preprocess(blankToUndefined, z.iso.date().optional());

export const checkbox = () => z.preprocess((v) => v === true || v === 'on' || v === 'true', z.boolean());

export const intField = (min = 0, max = 1_000_000) => z.coerce.number().int().min(min).max(max);
