import { NAME_PATTERN } from './constants.js';

export function normalizePlayerName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function sanitizePlayerName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

export function validatePlayerName(name) {
  const sanitizedName = sanitizePlayerName(name);

  if (!sanitizedName) {
    return { ok: false, error: 'El nombre es obligatorio.' };
  }

  if (!NAME_PATTERN.test(sanitizedName)) {
    return {
      ok: false,
      error:
        'El nombre debe tener entre 2 y 20 caracteres y solo puede contener letras, números, espacios, guiones o guion bajo.'
    };
  }

  return { ok: true, value: sanitizedName };
}