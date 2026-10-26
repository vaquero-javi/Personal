import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_MAX_AGE,
  REFRESH_TOKEN_COOKIE,
  cookieOptions,
  refreshSession,
  tokenExpiry,
} from './server/supabase-auth';

/**
 * Renueva la sesión antes de que la petición llegue a las páginas: si el token
 * de acceso falta o caduca en menos de un minuto y hay token de renovación, se
 * pide uno nuevo y se escribe tanto en la petición (para que el render lo vea)
 * como en la respuesta. La autorización real sigue en el servidor y en la RLS.
 */
export async function proxy(request: NextRequest) {
  if (process.env.AUTH_MODE === 'dev') return NextResponse.next();

  const access = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  const exp = access ? tokenExpiry(access) : null;
  const fresh = exp !== null && exp * 1000 - Date.now() > 60_000;
  if (fresh || !refresh) return NextResponse.next();

  try {
    const tokens = await refreshSession(refresh);
    request.cookies.set(ACCESS_TOKEN_COOKIE, tokens.access_token);
    request.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token);
    const response = NextResponse.next({ request });
    response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.access_token, cookieOptions(tokens.expires_in));
    response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token, cookieOptions(REFRESH_MAX_AGE));
    return response;
  } catch {
    // Renovación rechazada (sesión revocada): fuera cookies; las páginas enviarán a /entrar.
    const response = NextResponse.next();
    response.cookies.delete(ACCESS_TOKEN_COOKIE);
    response.cookies.delete(REFRESH_TOKEN_COOKIE);
    return response;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'],
};
