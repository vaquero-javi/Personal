'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { container } from './container';
import { formObject, runAction, type ActionState } from './actions';
import { DEV_USER_COOKIE, requireUserId } from './session';
import {
  ACCESS_TOKEN_COOKIE,
  PKCE_VERIFIER_COOKIE,
  REFRESH_MAX_AGE,
  REFRESH_TOKEN_COOKIE,
  authErrorMessage,
  cookieOptions,
  oauthUrl,
  signInWithPassword,
  signUp,
  type AuthTokens,
} from './supabase-auth';
import { headers } from 'next/headers';

async function storeSession(tokens: AuthTokens) {
  const store = await cookies();
  store.set(ACCESS_TOKEN_COOKIE, tokens.access_token, cookieOptions(tokens.expires_in));
  store.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token, cookieOptions(REFRESH_MAX_AGE));
}

const credentials = z.object({
  email: z.email('Email no válido').trim(),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});

export async function passwordSignIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentials.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return { error: 'Revisa los campos marcados', fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  try {
    await storeSession(await signInWithPassword(parsed.data.email, parsed.data.password));
  } catch (error) {
    return { error: authErrorMessage(error) };
  }
  redirect('/');
}

export async function passwordSignUp(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentials.extend({ fullName: z.string().trim().min(2, 'Escribe tu nombre') }).safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  });
  if (!parsed.success) return { error: 'Revisa los campos marcados', fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  let tokens: Partial<AuthTokens>;
  try {
    tokens = await signUp(parsed.data.email, parsed.data.password, parsed.data.fullName);
  } catch (error) {
    return { error: authErrorMessage(error) };
  }
  if (!tokens.access_token) return { ok: true, message: 'Te hemos enviado un email para confirmar la cuenta. Ábrelo y vuelve aquí para entrar.' };
  await storeSession(tokens as AuthTokens);
  redirect('/o/nueva');
}

export async function googleSignIn() {
  const origin = (await headers()).get('origin') ?? process.env.APP_URL ?? 'http://localhost:3100';
  const { url, verifier } = await oauthUrl('google', `${origin}/auth/callback`);
  (await cookies()).set(PKCE_VERIFIER_COOKIE, verifier, cookieOptions(600));
  redirect(url);
}

/** Solo en AUTH_MODE=dev: entra como el usuario de ejemplo elegido. */
export async function devSignIn(formData: FormData) {
  if (process.env.AUTH_MODE !== 'dev') throw new Error('Acceso de desarrollo desactivado');
  const userId = z.uuid().parse(formData.get('userId'));
  (await cookies()).set(DEV_USER_COOKIE, userId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  redirect('/');
}

export async function signOut() {
  const store = await cookies();
  store.delete(DEV_USER_COOKIE);
  store.delete(ACCESS_TOKEN_COOKIE);
  store.delete(REFRESH_TOKEN_COOKIE);
  redirect('/entrar');
}

export async function createOrganization(_: ActionState, formData: FormData): Promise<ActionState> {
  let slug = '';
  const result = await runAction(async () => {
    const userId = await requireUserId();
    const input = formObject(formData);
    await container().organizations.create(userId, input);
    slug = String(input.slug).trim().toLowerCase();
  });
  if (result.ok) redirect(`/o/${slug}`);
  return result;
}
