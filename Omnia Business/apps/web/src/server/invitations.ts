import 'server-only';
import { headers } from 'next/headers';
import type { NewMember } from '@omnia/organizations';
import { container } from './container';
import { accessGrantedMail, invitationMail, sendMail } from './mailer';
import { generateAccessLink, hasSignedInBefore } from './supabase-auth';

// Altas de miembros por email: la persona no necesita tener cuenta.
//  - Sin cuenta, o con cuenta en la que nunca ha entrado: se crea/reutiliza en
//    Supabase Auth y recibe un enlace a /auth/invitacion, donde pone su
//    contraseña y entra. Su alta queda «invitada» hasta entonces.
//  - Con cuenta en uso: alta activa y un aviso con enlace a /entrar.
// En AUTH_MODE=dev (base local, sin Supabase) la cuenta se crea en la base y el
// enlace entra directamente como esa persona.

export interface ResolvedAccount {
  userId: string;
  status: 'invited' | 'active';
  /** Enlace del botón del correo. */
  url: string;
}

export async function appUrl(): Promise<string> {
  const configured = process.env.APP_URL?.replace(/\/$/, '');
  if (configured) return configured;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host) return `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
  return 'http://localhost:3100';
}

const invitationUrl = (base: string, params: Record<string, string>) => `${base}/auth/invitacion?${new URLSearchParams(params)}`;

/**
 * Cuenta de la persona (creándola si hace falta) y enlace para el correo.
 * Quien ya usa Omnia no pone contraseña: su enlace abre directamente la
 * sociedad `orgSlug` (iniciando sesión antes si hace falta).
 */
export async function resolveAccount(member: Pick<NewMember, 'email' | 'fullName' | 'existingUserId'>, orgSlug: string): Promise<ResolvedAccount> {
  const base = await appUrl();
  const openOrg = `${base}/entrar?${new URLSearchParams({ siguiente: `/o/${orgSlug}` })}`;
  if (process.env.AUTH_MODE === 'dev') {
    let userId = member.existingUserId;
    if (!userId) {
      // Solo en desarrollo: base local sin RLS (ver /entrar).
      const [row] = await container().sql<{ id: string }[]>`
        insert into users (id, email, full_name) values (gen_random_uuid(), ${member.email}, ${member.fullName})
        returning id`;
      userId = row!.id;
    }
    // Sin Supabase no hay «último acceso»: cuenta como en uso si ya está activa en alguna sociedad.
    const [inUse] = await container().sql`select 1 from user_organizations where user_id = ${userId} and status = 'active' limit 1`;
    return inUse
      ? { userId, status: 'active', url: openOrg }
      : { userId, status: 'invited', url: invitationUrl(base, { dev: userId }) };
  }
  // Ya tiene cuenta y la usa (contraseña o Google): solo se le da acceso, sin enlace de alta.
  if (member.existingUserId && (await hasSignedInBefore(member.existingUserId))) {
    return { userId: member.existingUserId, status: 'active', url: openOrg };
  }
  const link = await generateAccessLink(member.email, member.fullName);
  if (link.hasSignedIn) return { userId: link.userId, status: 'active', url: openOrg };
  return { userId: link.userId, status: 'invited', url: invitationUrl(base, { token_hash: link.tokenHash, type: link.type }) };
}

export interface AccessMail {
  email: string;
  firstName: string;
  orgName: string;
  roleName: string;
  invitedBy: string;
  account: ResolvedAccount;
}

/** Manda el correo de invitación (o de aviso). Devuelve false si no hay SMTP configurado. */
export async function sendAccessMail({ email, firstName, orgName, roleName, invitedBy, account }: AccessMail): Promise<boolean> {
  const input = { to: email, firstName, orgName, roleName, invitedBy, url: account.url };
  const mail = account.status === 'invited' ? invitationMail(input) : accessGrantedMail(input);
  return sendMail(mail);
}

/**
 * Al iniciar sesión (contraseña, Google o el enlace del correo): sus altas
 * «invitadas» pasan a activas. No bloquea la entrada si falla.
 */
export async function acceptPendingInvitations(accessToken: string): Promise<void> {
  try {
    const { userId } = await container().verifyAccessToken!(accessToken);
    await container().organizations.acceptInvitations(userId);
  } catch (error) {
    console.error('No se han podido activar las invitaciones pendientes', error);
  }
}
