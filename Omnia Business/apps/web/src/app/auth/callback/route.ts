import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  PKCE_VERIFIER_COOKIE,
  REFRESH_MAX_AGE,
  REFRESH_TOKEN_COOKIE,
  cookieOptions,
  exchangeCode,
} from '@/server/supabase-auth';

/** Vuelta de Google (Supabase, PKCE): canjea el código por la sesión. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const verifier = request.cookies.get(PKCE_VERIFIER_COOKIE)?.value;
  const fail = NextResponse.redirect(new URL('/entrar?error=oauth', request.url));
  if (!code || !verifier) return fail;
  try {
    const tokens = await exchangeCode(code, verifier);
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.access_token, cookieOptions(tokens.expires_in));
    response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token, cookieOptions(REFRESH_MAX_AGE));
    response.cookies.delete(PKCE_VERIFIER_COOKIE);
    return response;
  } catch {
    return fail;
  }
}
