/**
 * Destino tras iniciar sesión (?siguiente=…). Solo rutas internas de una
 * sociedad, para que el enlace no pueda mandar a otra web.
 */
export function safeNextPath(value: unknown): string | null {
  return typeof value === 'string' && /^\/o\/[a-z0-9-]+(\/[A-Za-z0-9\-/]*)?$/.test(value) ? value : null;
}

export const NEXT_PATH_COOKIE = 'omnia_next';
