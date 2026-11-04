import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DomainError } from '@omnia/core';

/**
 * Credencial que viaja en el QR de la tarjeta.
 *
 *   OMN1:<id de la tarjeta>:<código>
 *
 * - Apple Wallet: el código es un secreto estático de 256 bits (Apple no admite
 *   QR rotativos). Una captura de pantalla serviría, así que la política pide
 *   además el PIN del titular en el TPV.
 * - Google Wallet: el código es un TOTP de 8 cifras que la propia app de Google
 *   genera cada 30 s a partir de la semilla (RotatingBarcode). Una captura caduca
 *   enseguida y cada código vale una sola vez.
 *
 * El QR no lleva datos personales ni el porcentaje: eso lo decide el servidor.
 */

export const QR_PREFIX = 'OMN1';
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 8;
/** Pasos aceptados alrededor del actual: tolera ±30 s de desfase de reloj del móvil. */
export const TOTP_WINDOW = 1;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATIC_CODE = /^[A-Za-z0-9_-]{43}$/;   // 32 bytes en base64url
const TOTP_CODE = new RegExp(`^\\d{${TOTP_DIGITS}}$`);

export type Wallet = 'apple' | 'google';

export interface ScannedCredential {
  cardId: string;
  code: string;
}

/** Lo que llega del lector (pistola USB/Bluetooth o cámara). Rechaza cualquier otra cosa sin tocar la base. */
export function parseQr(raw: string): ScannedCredential {
  const parts = raw.trim().split(':');
  if (parts.length !== 3 || parts[0] !== QR_PREFIX) {
    throw new DomainError('VALIDATION', 'Este QR no es una tarjeta de empleado de Omnia', { reason: 'QR_FORMAT' });
  }
  const [, cardId, code] = parts as [string, string, string];
  if (!UUID.test(cardId.toLowerCase()) || !(STATIC_CODE.test(code) || TOTP_CODE.test(code))) {
    throw new DomainError('VALIDATION', 'Este QR no es una tarjeta de empleado de Omnia', { reason: 'QR_FORMAT' });
  }
  return { cardId: cardId.toLowerCase(), code };
}

/** Secreto nuevo de una tarjeta: 32 bytes para Apple, 20 (SHA-1, RFC 4226) para la semilla TOTP de Google. */
export function newCardSecret(wallet: Wallet): Buffer {
  return randomBytes(wallet === 'apple' ? 32 : 20);
}

/** Texto del QR estático de Apple. */
export function appleQrMessage(cardId: string, secret: Buffer): string {
  return `${QR_PREFIX}:${cardId}:${secret.toString('base64url')}`;
}

/** Patrón que Google rellena en el móvil: {totp_value_0} es el código del momento. */
export function googleQrPattern(cardId: string): string {
  return `${QR_PREFIX}:${cardId}:{totp_value_0}`;
}

// ------------------------------------------------------------------ TOTP

/** RFC 6238 con HMAC-SHA1, como `TOTP_SHA1` de Google Wallet. */
export function totp(secret: Buffer, step: number, digits = TOTP_DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return binary.toString().padStart(digits, '0');
}

export const totpStep = (at: Date = new Date()) => Math.floor(at.getTime() / 1000 / TOTP_PERIOD_SECONDS);

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Comprueba el código leído contra el secreto de la tarjeta.
 * Devuelve el paso TOTP aceptado (Google), que la base guarda para que el
 * mismo código no valga dos veces, o null (Apple, código estático).
 */
export function verifyCode(wallet: Wallet, secret: Buffer, code: string, at: Date = new Date()): { ok: true; step: number | null } | { ok: false } {
  if (wallet === 'apple') {
    return STATIC_CODE.test(code) && sameText(code, secret.toString('base64url')) ? { ok: true, step: null } : { ok: false };
  }
  if (!TOTP_CODE.test(code)) return { ok: false };
  const now = totpStep(at);
  // Del más reciente al más antiguo: si coinciden dos, se registra el más alto.
  for (let delta = TOTP_WINDOW; delta >= -TOTP_WINDOW; delta--) {
    if (sameText(totp(secret, now + delta), code)) return { ok: true, step: now + delta };
  }
  return { ok: false };
}
