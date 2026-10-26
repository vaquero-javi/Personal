import 'server-only';
import { ZodError } from 'zod';
import { ORGANIZATION_HEADER, bearerToken, parseOrganizationScope, resolveTenantContext } from '@omnia/auth';
import { DomainError, isDomainError, type DomainErrorCode, type TenantContext } from '@omnia/core';
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
    const ctx = await resolveTenantContext(sql, userId, scope, requestId);

    const body = await useCase(ctx);
    return Response.json(body, { status, headers: { 'x-request-id': requestId } });
  } catch (error) {
    if (error instanceof ZodError) {
      return problem(422, 'VALIDATION', 'Datos no válidos', { issues: error.issues }, requestId);
    }
    if (isDomainError(error)) {
      return problem(STATUS[error.code], error.code, error.message, error.details, requestId);
    }
    console.error({ requestId, error });
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
