import 'server-only';
import { ZodError } from 'zod';
import { DomainError, isDomainError, logger, type DomainErrorCode } from '@omnia/core';
import { shiftFor, terminalToken, type Shift } from './session';

const STATUS: Record<DomainErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  INVALID_STATE: 409,
  INSUFFICIENT_STOCK: 409,
};

const problem = (status: number, code: string, detail: string, extra: Record<string, unknown> | undefined, requestId: string) =>
  Response.json(
    { type: `https://omnia.app/errors/${code.toLowerCase()}`, status, code, detail, requestId, ...extra },
    { status, headers: { 'content-type': 'application/problem+json', 'x-request-id': requestId } },
  );

/**
 * Route Handlers del TPV: el mismo acceso que las acciones (cookie del terminal
 * + turno firmado tras el PIN) y la misma forma de error que /api/v1 del backoffice.
 */
export async function handleShift(
  request: Request,
  useCase: (shift: Shift, terminal: { terminalId: string; token: string }) => Promise<unknown>,
  { permission = 'pos.use' }: { permission?: string } = {},
): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const log = logger.child({ requestId, app: 'tpv', path: new URL(request.url).pathname });
  const startedAt = performance.now();
  try {
    const shift = await shiftFor(permission);
    const token = await terminalToken();
    const body = await useCase({ ...shift, ctx: { ...shift.ctx, requestId } }, { terminalId: shift.terminal.terminalId, token });
    log.info('request', { status: 200, userId: shift.ctx.userId, ms: Math.round(performance.now() - startedAt) });
    return Response.json(body, { headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } });
  } catch (error) {
    const ms = Math.round(performance.now() - startedAt);
    if (error instanceof ZodError) return problem(422, 'VALIDATION', 'Datos no válidos', { issues: error.issues }, requestId);
    if (isDomainError(error)) {
      log.info('request', { status: STATUS[error.code], code: error.code, reason: error.details?.reason, ms });
      return problem(STATUS[error.code], error.code, error.message, error.details, requestId);
    }
    log.error('request failed', { status: 500, ms, error });
    return problem(500, 'INTERNAL', 'Error inesperado', undefined, requestId);
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new DomainError('VALIDATION', 'El cuerpo de la petición no es JSON');
  }
}
