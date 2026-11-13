/** ¿La petición viene del propio panel? (Origin ausente o «null» no cuenta). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
