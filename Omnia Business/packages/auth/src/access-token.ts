import { createRemoteJWKSet, jwtVerify } from 'jose';
import { DomainError } from '@omnia/core';

export interface AuthConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
}

export interface AuthenticatedUser {
  userId: string;
  email: string | undefined;
}

/** Configuración desde el entorno. Por defecto Supabase Auth; en enterprise, cualquier IdP OIDC. */
export function authConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const { AUTH_ISSUER, AUTH_AUDIENCE, AUTH_JWKS_URL } = env;
  if (!AUTH_ISSUER || !AUTH_JWKS_URL) throw new Error('AUTH_ISSUER y AUTH_JWKS_URL son obligatorias');
  return { issuer: AUTH_ISSUER, audience: AUTH_AUDIENCE ?? 'authenticated', jwksUrl: AUTH_JWKS_URL };
}

/**
 * Verifica la firma (JWKS asimétrico, cacheado por `jose`), el emisor, la
 * audiencia y la caducidad. El token NO lleva la organización activa: así un
 * cambio de empresa no exige refrescar el token y cada pestaña puede trabajar
 * en una empresa distinta (ver docs/arquitectura.md §2).
 */
export function createAccessTokenVerifier(config: AuthConfig) {
  const jwks = createRemoteJWKSet(new URL(config.jwksUrl));

  return async function verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        audience: config.audience,
        clockTolerance: 5,
      });
      if (!payload.sub) throw new Error('JWT sin sub');
      return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined };
    } catch {
      throw new DomainError('UNAUTHENTICATED', 'Sesión no válida o caducada');
    }
  };
}

export function bearerToken(authorization: string | null): string {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new DomainError('UNAUTHENTICATED', 'Falta la cabecera Authorization');
  return match[1];
}
