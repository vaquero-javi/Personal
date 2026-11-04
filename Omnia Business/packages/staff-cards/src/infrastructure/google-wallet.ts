import { SignJWT, importPKCS8 } from 'jose';

/**
 * Google Wallet: pase genérico (GenericObject) con QR rotativo TOTP.
 *
 * Requisitos (Google Pay & Wallet Console, gratis):
 *   GOOGLE_WALLET_ISSUER_ID   id del emisor
 *   GOOGLE_WALLET_SA_EMAIL    cuenta de servicio con acceso al emisor
 *   GOOGLE_WALLET_SA_KEY      su clave privada (PEM PKCS#8)
 *   WALLET_PUBLIC_URL         https://… (para el logo del pase)
 *
 * La semilla TOTP va en el objeto, que se crea por API desde el servidor. El
 * enlace «Añadir a Google Wallet» solo lleva el id del objeto: la semilla no
 * viaja nunca en una URL.
 */

export interface GoogleWalletConfig {
  issuerId: string;
  serviceAccountEmail: string;
  privateKeyPem: string;
  publicUrl: string;
}

export interface GooglePassData {
  cardId: string;
  totpSeedHex: string;
  qrPattern: string;            // OMN1:<id>:{totp_value_0}
  holderName: string;
  roleName: string;
  orgName: string;
  discountPct: string | null;
  revoked: boolean;
}

const API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';

export const googleClassId = (c: Pick<GoogleWalletConfig, 'issuerId'>) => `${c.issuerId}.omnia_staff_card`;
export const googleObjectId = (c: Pick<GoogleWalletConfig, 'issuerId'>, cardId: string) => `${c.issuerId}.staff_${cardId}`;

const text = (value: string) => ({ defaultValue: { language: 'es-ES', value } });

export function buildGenericClass(config: GoogleWalletConfig) {
  return { id: googleClassId(config), multipleDevicesAndHoldersAllowedStatus: 'ONE_USER_ALL_DEVICES' };
}

/** GenericObject de una tarjeta. Revocada: INACTIVE y sin QR. */
export function buildGenericObject(config: GoogleWalletConfig, data: GooglePassData) {
  const discount = data.revoked ? 'Anulada' : data.discountPct ? `${Number(data.discountPct).toLocaleString('es-ES')} %` : 'Sin descuento';
  return {
    id: googleObjectId(config, data.cardId),
    classId: googleClassId(config),
    state: data.revoked ? 'INACTIVE' : 'ACTIVE',
    cardTitle: text(data.orgName),
    header: text(data.holderName),
    subheader: text('Tarjeta de empleado'),
    hexBackgroundColor: '#1c1c1e',
    logo: { sourceUri: { uri: `${config.publicUrl.replace(/\/$/, '')}/brand/logo.png` } },
    textModulesData: [
      { id: 'role', header: 'Puesto', body: data.roleName },
      { id: 'discount', header: 'Descuento', body: discount },
    ],
    // Android: la app de Wallet no deja hacer capturas del pase.
    passConstraints: { screenshotEligibility: 'INELIGIBLE' },
    ...(data.revoked
      ? {}
      : {
          rotatingBarcode: {
            type: 'QR_CODE',
            valuePattern: data.qrPattern,
            totpDetails: {
              periodMillis: '30000',
              algorithm: 'TOTP_SHA1',
              parameters: [{ key: data.totpSeedHex, valueLength: 8 }],
            },
            alternateText: data.holderName,
          },
        }),
  };
}

async function signingKey(config: GoogleWalletConfig) {
  return importPKCS8(config.privateKeyPem, 'RS256');
}

/** Enlace «Añadir a Google Wallet» para un objeto ya creado (solo referencias). */
export async function saveUrl(config: GoogleWalletConfig, cardId: string, origins: string[] = []): Promise<string> {
  const jwt = await new SignJWT({
    origins,
    typ: 'savetowallet',
    payload: { genericObjects: [{ id: googleObjectId(config, cardId), classId: googleClassId(config) }] },
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(config.serviceAccountEmail)
    .setAudience('google')
    .setIssuedAt()
    .sign(await signingKey(config));
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

/** Token OAuth de la cuenta de servicio (JWT bearer grant). Se cachea hasta 5 min antes de caducar. */
let cachedToken: { value: string; expiresAt: number; email: string } | undefined;

async function accessToken(config: GoogleWalletConfig, fetchImpl: typeof fetch): Promise<string> {
  if (cachedToken && cachedToken.email === config.serviceAccountEmail && cachedToken.expiresAt > Date.now() + 300_000) {
    return cachedToken.value;
  }
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(config.serviceAccountEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(await signingKey(config));
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error(`Google OAuth ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000, email: config.serviceAccountEmail };
  return body.access_token;
}

export interface GoogleWalletClient {
  /** Crea o sustituye el objeto (y la clase, la primera vez). */
  upsertObject(data: GooglePassData): Promise<void>;
}

export function createGoogleWalletClient(config: GoogleWalletConfig, fetchImpl: typeof fetch = fetch): GoogleWalletClient {
  const call = async (method: string, path: string, body?: unknown) => {
    const response = await fetchImpl(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${await accessToken(config, fetchImpl)}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return response;
  };
  let classReady = false;
  const ensureClass = async () => {
    if (classReady) return;
    const found = await call('GET', `/genericClass/${googleClassId(config)}`);
    if (found.status === 404) {
      const created = await call('POST', '/genericClass', buildGenericClass(config));
      if (!created.ok && created.status !== 409) throw new Error(`Google Wallet (clase) ${created.status}: ${await created.text()}`);
    } else if (!found.ok) {
      throw new Error(`Google Wallet (clase) ${found.status}: ${await found.text()}`);
    }
    classReady = true;
  };
  return {
    async upsertObject(data) {
      await ensureClass();
      const object = buildGenericObject(config, data);
      const updated = await call('PUT', `/genericObject/${object.id}`, object);
      if (updated.status === 404) {
        const created = await call('POST', '/genericObject', object);
        if (!created.ok) throw new Error(`Google Wallet (alta) ${created.status}: ${await created.text()}`);
      } else if (!updated.ok) {
        throw new Error(`Google Wallet (actualización) ${updated.status}: ${await updated.text()}`);
      }
    },
  };
}

export function googleConfigFromEnv(env = process.env): GoogleWalletConfig | null {
  const { GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SA_EMAIL, GOOGLE_WALLET_SA_KEY, WALLET_PUBLIC_URL } = env;
  if (!GOOGLE_WALLET_ISSUER_ID || !GOOGLE_WALLET_SA_EMAIL || !GOOGLE_WALLET_SA_KEY || !WALLET_PUBLIC_URL) return null;
  return {
    issuerId: GOOGLE_WALLET_ISSUER_ID,
    serviceAccountEmail: GOOGLE_WALLET_SA_EMAIL,
    privateKeyPem: GOOGLE_WALLET_SA_KEY.replace(/\\n/g, '\n'),
    publicUrl: WALLET_PUBLIC_URL,
  };
}
