import type { z } from 'zod';
import type { Session } from './session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

/**
 * Cliente de /api/v1 compartido por web, PWA y Capacitor (iOS/Android): todas
 * las plataformas hablan con el mismo API y envían la organización activa en
 * la cabecera `x-organization-id`. La respuesta se valida con el contrato Zod
 * del módulo, así que un cambio de API rompe en desarrollo y no en producción.
 */
export async function apiRequest<S extends z.ZodType>(
  session: Session,
  path: string,
  schema: S,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<z.infer<S>> {
  const response = await fetch(`/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${await session.getAccessToken()}`,
      'x-organization-id': session.organizationId,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = (body ?? {}) as { code?: string; detail?: string };
    throw new ApiError(response.status, problem.code ?? 'HTTP_ERROR', problem.detail ?? response.statusText, body);
  }
  return schema.parse(body);
}
