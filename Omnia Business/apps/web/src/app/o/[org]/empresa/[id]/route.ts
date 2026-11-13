import { NextResponse, type NextRequest } from 'next/server';
import { MODULES } from '@/components/shell/modules';
import { establishmentCookie, orgEstablishments, requireOrg } from '@/server/session';

/**
 * Enlace de una empresa en la barra lateral: abre la sociedad filtrada por esa
 * empresa (`todas` quita el filtro). Conserva el módulo abierto (?ir=almacen).
 * Solo vale una empresa activa de esa sociedad; cualquier otra cosa, sin filtro.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  const { org } = await requireOrg(slug);
  const ir = request.nextUrl.searchParams.get('ir') ?? '';
  const module = MODULES.some((m) => m.slug === ir && m.slug !== '') ? `/${ir}` : '';
  const response = NextResponse.redirect(new URL(`/o/${slug}${module}`, request.url));
  const name = establishmentCookie(org.organizationId);
  const valid = id !== 'todas' && (await orgEstablishments(slug)).some((e) => e.id === id && e.isActive);
  if (valid) {
    response.cookies.set(name, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === 'production' });
  } else {
    response.cookies.delete(name);
  }
  return response;
}
