import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Contraseñas y sesión del panel. Puro Node, sin Next: se prueba aparte
// (credentials.test.ts) y lo reutiliza scripts/admin-password.mjs.

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 32;

/** `scrypt$<sal base64>$<clave base64>`: el mismo formato que los PIN del TPV. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await scryptAsync(password, salt, KEY_LENGTH)).toString('base64')}`;
}

// Para emails que no existen se compara igualmente contra este hash: así la
// respuesta tarda lo mismo y no revela quién es del equipo.
const DECOY_HASH = `scrypt$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(KEY_LENGTH).toString('base64')}`;

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const [scheme, saltB64, keyB64] = (stored ?? DECOY_HASH).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length || KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual) && stored != null;
}

/** Requisitos mínimos de una contraseña del equipo. */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return 'Usa al menos 12 caracteres.';
  if (password.length > 200) return 'Demasiado larga.';
  return null;
}

// ---------------------------------------------------------------- sesión firmada

export interface PanelSession {
  /** id del usuario (public.users) */
  uid: string;
  /** platform_admins.session_version al entrar: cambiar la contraseña invalida la sesión */
  ver: number;
  /** caducidad, segundos UNIX */
  exp: number;
}

export const SESSION_TTL_SECONDS = 60 * 60 * 12;

function secret(): Buffer {
  const raw = process.env.ADMIN_SESSION_SECRET;
  if (!raw || raw.length < 32) throw new Error('ADMIN_SESSION_SECRET es obligatoria (32+ caracteres: openssl rand -base64 32)');
  return Buffer.from(raw);
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function encodeSession(session: Omit<PanelSession, 'exp'>, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined, now = Date.now()): PanelSession | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<PanelSession>;
    if (typeof data.uid !== 'string' || typeof data.ver !== 'number' || typeof data.exp !== 'number') return null;
    if (data.exp * 1000 <= now) return null;
    return { uid: data.uid, ver: data.ver, exp: data.exp };
  } catch {
    return null;
  }
}
