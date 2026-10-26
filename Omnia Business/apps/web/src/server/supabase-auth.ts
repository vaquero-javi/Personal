// Cliente mínimo de Supabase Auth (GoTrue) por REST: sin SDK en el navegador,
// los tokens viven solo en cookies httpOnly. Lo usan las acciones de /entrar,
// la ruta /auth/callback (Google, PKCE) y proxy.ts (renovación).

export const ACCESS_TOKEN_COOKIE = 'omnia_access_token';
export const REFRESH_TOKEN_COOKIE = 'omnia_refresh_token';
export const PKCE_VERIFIER_COOKIE = 'omnia_pkce_verifier';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function config() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Faltan SUPABASE_URL y SUPABASE_ANON_KEY');
  return { url: url.replace(/\/$/, ''), anonKey };
}

async function gotrue<T>(path: string, body: unknown): Promise<T> {
  const { url, anonKey } = config();
  const res = await fetch(`${url}/auth/v1${path}`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as T & { error_description?: string; msg?: string; error_code?: string };
  if (!res.ok) throw new AuthError(data.error_code ?? String(res.status), data.error_description ?? data.msg ?? 'Error de autenticación');
  return data;
}

export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Mensajes de GoTrue traducidos para la pantalla de acceso. */
export function authErrorMessage(error: unknown): string {
  if (!(error instanceof AuthError)) return 'No se ha podido conectar con el servicio de acceso. Inténtalo de nuevo.';
  switch (error.code) {
    case 'invalid_credentials':
    case '400':
      return 'Email o contraseña incorrectos.';
    case 'email_not_confirmed':
      return 'Confirma tu email con el enlace que te enviamos antes de entrar.';
    case 'user_already_exists':
      return 'Ya existe una cuenta con ese email. Entra con tu contraseña.';
    case 'weak_password':
      return 'La contraseña es demasiado débil: usa al menos 8 caracteres.';
    case 'over_request_rate_limit':
      return 'Demasiados intentos. Espera un minuto.';
    default:
      return error.message;
  }
}

export const signInWithPassword = (email: string, password: string) =>
  gotrue<AuthTokens>('/token?grant_type=password', { email, password });

export const refreshSession = (refreshToken: string) => gotrue<AuthTokens>('/token?grant_type=refresh_token', { refresh_token: refreshToken });

/** Alta. Si el proyecto exige confirmar el email, no devuelve sesión todavía. */
export const signUp = (email: string, password: string, fullName: string) =>
  gotrue<Partial<AuthTokens>>('/signup', { email, password, data: { full_name: fullName } });

export const exchangeCode = (authCode: string, codeVerifier: string) =>
  gotrue<AuthTokens>('/token?grant_type=pkce', { auth_code: authCode, code_verifier: codeVerifier });

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64url');

/** URL de Google vía Supabase con PKCE: el verificador va a una cookie httpOnly. */
export async function oauthUrl(provider: 'google', redirectTo: string) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const { url } = config();
  const params = new URLSearchParams({ provider, redirect_to: redirectTo, code_challenge: challenge, code_challenge_method: 's256' });
  return { url: `${url}/auth/v1/authorize?${params}`, verifier };
}

/** Caducidad (segundos UNIX) del JWT, sin verificarlo: solo para decidir si renovar. */
export function tokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
});

export const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;
