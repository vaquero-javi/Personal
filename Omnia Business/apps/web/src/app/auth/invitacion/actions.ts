'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/server/actions';
import { container } from '@/server/container';
import { acceptPendingInvitations } from '@/server/invitations';
import { DEV_USER_COOKIE } from '@/server/session';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_MAX_AGE,
  REFRESH_TOKEN_COOKIE,
  authErrorMessage,
  cookieOptions,
  updatePassword,
  verifyTokenHash,
  type AuthTokens,
} from '@/server/supabase-auth';

const Input = z
  .object({
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirm: z.string(),
    tokenHash: z.string().optional(),
    type: z.enum(['invite', 'magiclink']).optional(),
    dev: z.uuid().optional(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden' });

/**
 * Desde el correo de invitación: canjea el enlace por una sesión, pone la
 * contraseña y entra. Sus altas invitadas pasan a activas.
 */
export async function activateAccess(_: ActionState, formData: FormData): Promise<ActionState> {
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  const parsed = Input.safeParse({
    password: field('password') ?? '',
    confirm: field('confirm') ?? '',
    tokenHash: field('tokenHash'),
    type: field('type'),
    dev: field('dev'),
  });
  if (!parsed.success) {
    return { error: 'Revisa los campos marcados', fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const input = parsed.data;
  const store = await cookies();

  if (process.env.AUTH_MODE === 'dev') {
    // Desarrollo local: sin Supabase no hay contraseña; se entra como esa persona.
    if (!input.dev) return { error: 'Enlace no válido' };
    store.set(DEV_USER_COOKIE, input.dev, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
    await container().organizations.acceptInvitations(input.dev);
    redirect('/app');
  }

  if (!input.tokenHash || !input.type) return { error: 'Enlace no válido. Ábrelo de nuevo desde el correo.' };
  let accessToken: string;
  try {
    const tokens: AuthTokens = await verifyTokenHash(input.type, input.tokenHash);
    store.set(ACCESS_TOKEN_COOKIE, tokens.access_token, cookieOptions(tokens.expires_in));
    store.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token, cookieOptions(REFRESH_MAX_AGE));
    accessToken = tokens.access_token;
  } catch (error) {
    // El enlace es de un solo uso: si un intento anterior ya lo canjeó (y falló la contraseña), sigue su sesión.
    const previous = store.get(ACCESS_TOKEN_COOKIE)?.value;
    if (!previous) return { error: authErrorMessage(error) };
    accessToken = previous;
  }
  try {
    await updatePassword(accessToken, input.password);
  } catch (error) {
    return { error: authErrorMessage(error) };
  }
  await acceptPendingInvitations(accessToken);
  redirect('/app');
}
