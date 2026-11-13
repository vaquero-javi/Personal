import 'server-only';
import { ZodError } from 'zod';
import { DomainError, isDomainError, logger, type DomainErrorCode } from '@omnia/core';
import { isSameOrigin } from './origin';
import { currentAdminId } from './session';

const STATUS: Record<DomainErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  INVALID_STATE: 409,
  INSUFFICIENT_STOCK: 409,
  FEATURE_DISABLED: 403,
};

function problem(status: number, code: string, detail: string, extra?: Record<string, unknown>, requestId?: string) {
  return Response.json(
    { type: `https://omnia.app/errors/${code.toLowerCase()}`, status, code, detail, requestId, ...extra },
    { status, headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' } },
  );
}

/**
 * Envoltorio de la API del panel (/api/organizations/*):
 *   1. Escrituras: el Origin debe ser este mismo panel (otra web no puede disparar cambios con tus cookies).
 *   2. Sesión firmada del panel, vigente en la base; si no, 404 (no se revela que existe).
 *   3. Las funciones app.admin_* de la base vuelven a exigir el rol (defensa en profundidad).
 */
export async function handleAdmin(
  request: Request,
  useCase: (userId: string) => Promise<unknown>,
  { status = 200 }: { status?: number } = {},
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const log = logger.child({ app: 'admin', requestId, method: request.method, path: url.pathname });
  const startedAt = performance.now();
  let userId: string | null = null;
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      if (!isSameOrigin(request)) throw new DomainError('FORBIDDEN', 'Origen no permitido');
    }
    userId = await currentAdminId();
    if (!userId) throw new DomainError('NOT_FOUND', 'No encontrado');
    const body = await useCase(userId);
    log.info('request', { status, userId, ms: Math.round(performance.now() - startedAt) });
    return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const ms = Math.round(performance.now() - startedAt);
    if (error instanceof ZodError) {
      log.info('request', { status: 422, ms, userId });
      return problem(422, 'VALIDATION', 'Datos no válidos', { issues: error.issues }, requestId);
    }
    if (isDomainError(error)) {
      log.info('request', { status: STATUS[error.code], code: error.code, ms, userId });
      return problem(STATUS[error.code], error.code, error.message, error.details, requestId);
    }
    log.error('request failed', { status: 500, ms, userId, error });
    return problem(500, 'INTERNAL', 'Error inesperado', undefined, requestId);
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
