import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { container } from './container';
import { SESSION_TTL_SECONDS, decodeSession } from './credentials';

export const SESSION_COOKIE = 'omnia_admin_session';

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
};

/**
 * Persona del equipo de esta petición, o null. Firma y caducidad de la cookie,
 * y además, en la base: que siga en platform_admins y que no haya cambiado la
 * contraseña desde que entró. Quitar a alguien le corta el acceso al momento.
 */
export const currentAdminId = cache(async (): Promise<string | null> => {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const [row] = await container().sql<{ ok: boolean }[]>`select app.platform_admin_session_valid(${session.uid}, ${session.ver}) as ok`;
  return row?.ok ? session.uid : null;
});

/** Toda página del panel pasa por aquí. */
export const requireAdmin = cache(async (): Promise<{ userId: string; name: string }> => {
  const userId = await currentAdminId();
  if (!userId) redirect('/entrar');
  const me = await container().organizations.me(userId);
  return { userId, name: me.fullName ?? me.email };
});
