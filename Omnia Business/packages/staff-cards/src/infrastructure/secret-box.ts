import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * Cifrado de los secretos de las tarjetas (AES-256-GCM). La clave vive en el
 * entorno de la aplicación (STAFF_CARD_SECRET_KEY, 32 bytes en base64), nunca en
 * la base: una copia o un volcado de la base no basta para fabricar QR válidos.
 *
 * Formato: versión (1 byte) | iv (12) | tag (16) | cifrado.
 * La versión permite rotar la clave más adelante sin migrar todo de golpe.
 */
export interface SecretBox {
  seal(plain: Buffer): Buffer;
  open(sealed: Buffer): Buffer;
  /**
   * Token derivado (HMAC) para un propósito y un id: se puede regenerar siempre
   * sin guardarlo. Lo usa el authenticationToken de Apple, del que la base solo
   * guarda el hash.
   */
  derive(purpose: string, id: string): string;
}

const VERSION = 1;

export function createSecretBox(keyBase64 = process.env.STAFF_CARD_SECRET_KEY): SecretBox {
  if (!keyBase64) throw new Error('STAFF_CARD_SECRET_KEY no está definida (32 bytes en base64: `openssl rand -base64 32`)');
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('STAFF_CARD_SECRET_KEY debe tener 32 bytes');
  return {
    seal(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(plain), cipher.final()]);
      return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
    },
    open(sealed) {
      if (sealed[0] !== VERSION) throw new Error(`Versión de cifrado desconocida: ${sealed[0]}`);
      const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(1, 13));
      decipher.setAuthTag(sealed.subarray(13, 29));
      return Buffer.concat([decipher.update(sealed.subarray(29)), decipher.final()]);
    },
    derive(purpose, id) {
      // Subclave por propósito: la clave de cifrado no se usa directamente como clave HMAC.
      const subkey = createHmac('sha256', key).update(`omnia:${purpose}`).digest();
      return createHmac('sha256', subkey).update(id).digest('base64url');
    },
  };
}
