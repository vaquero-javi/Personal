import 'server-only';
import { ZodError } from 'zod';
import { ORGANIZATION_HEADER, bearerToken, parseOrganizationScope, resolveTenantContext } from '@omnia/auth';
import { DomainError, isDomainError, logger, type DomainErrorCode, type TenantContext } from '@omnia/core';
import { container } from './container';
import { currentUserId } from './session';

const STATUS: Record<DomainErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  INVALID_STATE: 409,
  INSUFFICIENT_STOCK: 409,
};

/** Respuesta de error con forma estable (RFC 9457, application/problem+json). */
function problem(status: number, code: string, detail: string, extra?: Record<string, unknown>, requestId?: string) {
  return Response.json(
    { type: `https://omnia.app/errors/${code.toLowerCase()}`, status, code, detail, requestId, ...extra },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

/**
 * Envoltorio de cada Route Handler de /api/v1:
 *   1. Verifica el JWT (Authorization: Bearer …).
 *   2. Resuelve la organización activa (cabecera x-organization-id) contra las membresías.
 *   3. Ejecuta el caso de uso con ese TenantContext.
 *   4. Traduce errores de dominio / Zod a problem+json.
 */
export async function handle(
  request: Request,
  useCase: (ctx: TenantContext) => Promise<unknown>,
  { status = 200 }: { status?: number } = {},
): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const log = logger.child({ requestId, method: request.method, path: new URL(request.url).pathname });
  const startedAt = performance.now();
  let ctx: TenantContext | undefined;
  try {
    const { sql, verifyAccessToken } = container();
    // Clientes nativos/PWA: Bearer. Navegador: la cookie de sesión de la web.
    const authorization = request.headers.get('authorization');
    const userId =
      authorization && verifyAccessToken
        ? (await verifyAccessToken(bearerToken(authorization))).userId
        : await currentUserId();
    if (!userId) throw new DomainError('UNAUTHENTICATED', 'Sesión no válida o caducada');
    const scope = parseOrganizationScope(request.headers.get(ORGANIZATION_HEADER));
    ctx = await resolveTenantContext(sql, userId, scope, requestId);

    const body = await useCase(ctx);
    log.info('request', { status, userId: ctx.userId, orgIds: ctx.organizationIds, ms: Math.round(performance.now() - startedAt) });
    return Response.json(body, { status, headers: { 'x-request-id': requestId } });
  } catch (error) {
    const who = ctx ? { userId: ctx.userId, orgIds: ctx.organizationIds } : {};
    const ms = Math.round(performance.now() - startedAt);
    if (error instanceof ZodError) {
      log.info('request', { status: 422, code: 'VALIDATION', ms, ...who });
      return problem(422, 'VALIDATION', 'Datos no válidos', { issues: error.issues }, requestId);
    }
    if (isDomainError(error)) {
      // Errores esperados (stock insuficiente, sin permiso…): no son fallos del sistema.
      log.info('request', { status: STATUS[error.code], code: error.code, ms, ...who });
      return problem(STATUS[error.code], error.code, error.message, error.details, requestId);
    }
    log.error('request failed', { status: 500, ms, ...who, error });
    return problem(500, 'INTERNAL', 'Error inesperado', undefined, requestId);
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined; // Zod lo rechazará con un 422 legible
  }
}
