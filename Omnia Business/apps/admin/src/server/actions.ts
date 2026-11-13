'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { logger } from '@omnia/core';
import { container } from './container';
import { encodeSession, verifyPassword } from './credentials';
import { SESSION_COOKIE, sessionCookieOptions } from './session';

export interface SignInState {
  error?: string;
}

// Un único mensaje para email inexistente, sin contraseña o contraseña mal: no se revela quién es del equipo.
const WRONG = 'Email o contraseña incorrectos.';
const credentials = z.object({ email: z.email().trim().max(254), password: z.string().min(1).max(200) });

export async function passwordSignIn(_: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = credentials.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return { error: 'Escribe tu email y tu contraseña.' };
  const { sql } = container();

  const [row] = await sql<{ user_id: string; password_hash: string | null; locked_until: Date | null }[]>`
    select user_id, password_hash, locked_until from app.platform_admin_credentials(${parsed.data.email})`;

  // Siempre se calcula el scrypt (también sin fila), para que el tiempo de respuesta no delate nada.
  const ok = await verifyPassword(parsed.data.password, row?.password_hash);
  if (row?.locked_until && row.locked_until.getTime() > Date.now()) {
    return { error: 'Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar.' };
  }
  if (!row) return { error: WRONG };

  const [{ version } = { version: null }] = await sql<{ version: number | null }[]>`
    select app.platform_admin_login_result(${row.user_id}, ${ok}) as version`;
  logger.info('admin sign-in', { app: 'admin', userId: row.user_id, ok });
  if (!ok || version === null) return { error: WRONG };

  (await cookies()).set(SESSION_COOKIE, encodeSession({ uid: row.user_id, ver: version }), sessionCookieOptions);
  redirect('/');
}
