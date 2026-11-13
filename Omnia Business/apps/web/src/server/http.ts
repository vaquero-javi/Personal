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
  FEATURE_DISABLED: 403,
};

/** Respuesta de error con forma estable (RFC 9457, application/problem+json). */
function problem(status: number, code: string, detail: string, extra?: Record<string, unknown>, requestId?: string) {
  return Response.json(
    { type: `https://omnia.app/errors/${code.toLowerCase()}`, status, code, detail, requestId, ...extra },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

interface HandleOptions {
  status?: number;
  /**
   * Módulo que exige la ruta (p. ej. 'purchasing.received_invoices'). Se comprueba
   * después de resolver la sociedad y antes del caso de uso: si falta, 403 con
   * `{ error: 'FEATURE_DISABLED', required_feature }`. Para los módulos que tapan
   * permisos, la RLS lo impediría igualmente; esto da un error claro y cubre los
   * submódulos de interfaz, que la RLS no ve.
   */
  feature?: string;
}

/** Usuario de la petición: Bearer (nativo/PWA) o cookie de sesión (navegador). */
async function authenticate(request: Request): Promise<string> {
  const { verifyAccessToken } = container();
  const authorization = request.headers.get('authorization');
  const userId =
    authorization && verifyAccessToken
      ? (await verifyAccessToken(bearerToken(authorization))).userId
      : await currentUserId();
  if (!userId) throw new DomainError('UNAUTHENTICATED', 'Sesión no válida o caducada');
  return userId;
}

/** Traduce cualquier error a problem+json y lo registra. */
function failure(error: unknown, log: ReturnType<typeof logger.child>, ms: number, requestId: string, who: Record<string, unknown>) {
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

/**
 * Envoltorio de cada Route Handler de /api/v1:
 *   1. Verifica el JWT (Authorization: Bearer …).
 *   2. Resuelve la organización activa (cabecera x-organization-id) contra las membresías.
 *   3. Si se pide, comprueba que la sociedad tiene el módulo (`feature`).
 *   4. Ejecuta el caso de uso con ese TenantContext.
 *   5. Traduce errores de dominio / Zod a problem+json.
 */
export async function handle(
  request: Request,
  useCase: (ctx: TenantContext) => Promise<unknown>,
  { status = 200, feature }: HandleOptions = {},
): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const log = logger.child({ requestId, method: request.method, path: new URL(request.url).pathname });
  const startedAt = performance.now();
  let ctx: TenantContext | undefined;
  try {
    const { sql, entitlements } = container();
    const userId = await authenticate(request);
    const scope = parseOrganizationScope(request.headers.get(ORGANIZATION_HEADER));
    ctx = await resolveTenantContext(sql, userId, scope, requestId);
    if (feature) await entitlements.require(ctx, feature);

    const body = await useCase(ctx);
    log.info('request', { status, userId: ctx.userId, orgIds: ctx.organizationIds, ms: Math.round(performance.now() - startedAt) });
    return Response.json(body, { status, headers: { 'x-request-id': requestId } });
  } catch (error) {
    const who = ctx ? { userId: ctx.userId, orgIds: ctx.organizationIds } : {};
    return failure(error, log, Math.round(performance.now() - startedAt), requestId, who);
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined; // Zod lo rechazará con un 422 legible
  }
}
