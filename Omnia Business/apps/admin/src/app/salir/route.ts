import { NextResponse, type NextRequest } from 'next/server';
import { isSameOrigin } from '@/server/origin';
import { SESSION_COOKIE } from '@/server/session';

/** Cierra la sesión del panel (no toca la de la web, que tiene sus propias cookies). */
export async function POST(request: NextRequest) {
  // Solo desde el propio panel (un formulario de otra web no puede cerrarte la sesión).
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 });
  const response = NextResponse.redirect(new URL('/entrar', request.url), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
