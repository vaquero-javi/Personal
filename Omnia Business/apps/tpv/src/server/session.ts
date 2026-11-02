import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DomainError, type TenantContext } from '@omnia/core';
import { hasPermission } from '@omnia/organizations';
import type { PosTerminal } from '@omnia/pos';
import { container } from './container';

/**
 * Dos cookies:
 *  - terminal: token del dispositivo, emitido al vincularlo desde el backoffice.
 *    Sin él no se ve nada (ni siquiera la lista de personal).
 *  - turno: quién está usando el terminal, firmada con HMAC tras comprobar su PIN.
 * En cada petición se vuelve a resolver el terminal y la membresía: desvincular
 * la tablet o suspender a alguien tiene efecto inmediato.
 */
export const TERMINAL_COOKIE = 'omnia_tpv_terminal';
export const OPERATOR_COOKIE = 'omnia_tpv_operator';
const SHIFT_HOURS = 12;

const secure = process.env.NODE_ENV === 'production';
export const terminalCookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: 400 * 24 * 3600 };
export const operatorCookieOptions = { httpOnly: true, sameSite: 'strict' as const, secure, path: '/', maxAge: SHIFT_HOURS * 3600 };

function secret() {
  const value = process.env.POS_SESSION_SECRET;
  if (!value || value.length < 16) throw new Error('POS_SESSION_SECRET no está definida (mínimo 16 caracteres)');
  return value;
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function operatorCookieValue(terminalId: string, userId: string) {
  const payload = Buffer.from(JSON.stringify({ t: terminalId, u: userId, exp: Date.now() + SHIFT_HOURS * 3600_000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readOperator(value: string | undefined): { t: string; u: string } | null {
  if (!value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { t: string; u: string; exp: number };
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export const terminalToken = async () => (await cookies()).get(TERMINAL_COOKIE)?.value ?? '';

export const currentTerminal = cache(async (): Promise<PosTerminal | null> => {
  const token = await terminalToken();
  return token ? container().pos.terminal(token) : null;
});

export async function requireTerminal(): Promise<PosTerminal> {
  const terminal = await currentTerminal();
  if (!terminal) redirect('/vincular');
  return terminal;
}

export interface Shift {
  terminal: PosTerminal;
  ctx: TenantContext;
  user: { id: string; name: string; roleName: string };
  can: (permission: string) => boolean;
}

async function resolveShift(): Promise<Shift | null> {
  const terminal = await currentTerminal();
  if (!terminal) return null;
  const operator = readOperator((await cookies()).get(OPERATOR_COOKIE)?.value);
  if (!operator || operator.t !== terminal.terminalId) return null;
  const [memberships, me] = await Promise.all([container().organizations.memberships(operator.u), container().organizations.me(operator.u)]);
  const membership = memberships.find((m) => m.organizationId === terminal.organizationId);
  if (!membership || !hasPermission(membership.permissions, 'pos.use')) return null;
  return {
    terminal,
    ctx: { userId: operator.u, organizationIds: [terminal.organizationId] },
    user: { id: me.id, name: me.fullName ?? me.email, roleName: membership.roleName },
    can: (permission) => hasPermission(membership.permissions, permission),
  };
}

/** Páginas: sin terminal → vincular; sin turno → pantalla de PIN. */
export const requireShift = cache(async (): Promise<Shift> => {
  const shift = await resolveShift();
  if (shift) return shift;
  redirect((await currentTerminal()) ? '/' : '/vincular');
});

/** Acciones: lanzan en vez de redirigir (la RLS lo impediría igualmente). */
export async function shiftFor(permission = 'pos.use'): Promise<Shift> {
  const shift = await resolveShift();
  if (!shift) throw new DomainError('UNAUTHENTICATED', 'El turno ha caducado: vuelve a entrar con tu PIN');
  if (!shift.can(permission)) throw new DomainError('FORBIDDEN', 'Esto lo hace un encargado');
  return shift;
}
