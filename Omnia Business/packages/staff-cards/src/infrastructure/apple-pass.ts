import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import forge from 'node-forge';

/**
 * Pase de Apple Wallet (.pkpass): un ZIP con
 *   pass.json      lo que se ve y el QR
 *   *.png          icono y logo
 *   manifest.json  SHA-1 de cada fichero
 *   signature      firma PKCS#7 separada de manifest.json con el certificado
 *                  «Pass Type ID» de Apple + el intermedio WWDR
 *
 * Requisitos (cuenta Apple Developer, 99 $/año):
 *   APPLE_PASS_TYPE_ID   pass.com.omnia.staff
 *   APPLE_TEAM_ID        identificador del equipo
 *   APPLE_PASS_CERT_PEM  certificado del Pass Type ID (PEM)
 *   APPLE_PASS_KEY_PEM   su clave privada (PEM; con APPLE_PASS_KEY_PASSPHRASE si está cifrada)
 *   APPLE_WWDR_PEM       certificado intermedio Apple WWDR (G4)
 *   WALLET_PUBLIC_URL    https://… donde vive el web service (Apple exige HTTPS)
 */

export interface AppleSignerConfig {
  passTypeIdentifier: string;
  teamIdentifier: string;
  certificatePem: string;
  privateKeyPem: string;
  privateKeyPassphrase?: string | undefined;
  wwdrPem: string;
  /** Base del web service; Apple añade /v1/… */
  webServiceUrl: string;
}

export interface StaffPassData {
  cardId: string;
  version: number;
  authenticationToken: string;
  qrMessage: string | null;        // null si está revocada: el pase anulado no lleva QR
  holderName: string;
  roleName: string;
  orgName: string;
  discountPct: string | null;
  revoked: boolean;
  updatedAt: Date;
}

/** pass.json de una tarjeta de empleado (estilo «generic»). */
export function buildPassJson(config: Pick<AppleSignerConfig, 'passTypeIdentifier' | 'teamIdentifier' | 'webServiceUrl'>, data: StaffPassData) {
  const discount = data.revoked ? 'Anulada' : data.discountPct ? `${Number(data.discountPct).toLocaleString('es-ES')} %` : 'Sin descuento';
  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeIdentifier,
    teamIdentifier: config.teamIdentifier,
    serialNumber: data.cardId,
    organizationName: data.orgName,
    description: `Tarjeta de empleado · ${data.orgName}`,
    logoText: data.orgName,
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor: 'rgb(255, 214, 102)',
    backgroundColor: 'rgb(28, 28, 30)',
    // Actualizaciones: el móvil se registra aquí y recibe los cambios por push.
    webServiceURL: config.webServiceUrl,
    authenticationToken: data.authenticationToken,
    // No se puede reenviar por AirDrop ni «Compartir» (iOS 16+). No evita capturas.
    sharingProhibited: true,
    voided: data.revoked,
    generic: {
      primaryFields: [{ key: 'holder', label: 'EMPLEADO', value: data.holderName }],
      secondaryFields: [
        { key: 'role', label: 'PUESTO', value: data.roleName },
        { key: 'discount', label: 'DESCUENTO', value: discount, changeMessage: 'Tu descuento de empleado ahora es %@' },
      ],
      auxiliaryFields: [{ key: 'status', label: 'ESTADO', value: data.revoked ? 'Anulada' : 'Activa', changeMessage: 'Tarjeta %@' }],
      backFields: [
        { key: 'howto', label: 'Cómo se usa', value: 'Enseña el QR en el TPV antes de cobrar. Te pedirán tu PIN de Omnia. El descuento se aplica a toda la cuenta.' },
        { key: 'rules', label: 'Uso personal', value: 'La tarjeta es personal e intransferible. Cada uso queda registrado con tu nombre.' },
        { key: 'serial', label: 'Nº de tarjeta', value: data.cardId },
      ],
    },
    ...(data.qrMessage
      ? { barcodes: [{ format: 'PKBarcodeFormatQR', message: data.qrMessage, messageEncoding: 'iso-8859-1', altText: data.holderName }] }
      : {}),
  };
}

const sha1 = (data: Uint8Array) => createHash('sha1').update(data).digest('hex');

/** Firma PKCS#7 separada (DER) de manifest.json, como la espera Wallet. */
export function signManifest(manifest: Buffer, config: Pick<AppleSignerConfig, 'certificatePem' | 'privateKeyPem' | 'privateKeyPassphrase' | 'wwdrPem'>): Buffer {
  const certificate = forge.pki.certificateFromPem(config.certificatePem);
  const wwdr = forge.pki.certificateFromPem(config.wwdrPem);
  const key = config.privateKeyPassphrase
    ? forge.pki.decryptRsaPrivateKey(config.privateKeyPem, config.privateKeyPassphrase)
    : forge.pki.privateKeyFromPem(config.privateKeyPem);
  if (!key) throw new Error('No se pudo leer la clave privada del certificado de Apple (¿contraseña?)');

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString('binary'));
  p7.addCertificate(wwdr);
  p7.addCertificate(certificate);
  p7.addSigner({
    key,
    certificate,
    digestAlgorithm: forge.pki.oids.sha256!,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType!, value: forge.pki.oids.data! },
      { type: forge.pki.oids.messageDigest! },
      { type: forge.pki.oids.signingTime!, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
}

/** Empaqueta el .pkpass completo. `images` debe incluir al menos icon.png. */
export function buildPkpass(config: AppleSignerConfig, data: StaffPassData, images: Record<string, Buffer>): Buffer {
  if (!images['icon.png']) throw new Error('Un pase de Apple necesita icon.png');
  const files: Record<string, Uint8Array> = {
    'pass.json': Buffer.from(JSON.stringify(buildPassJson(config, data))),
    ...images,
  };
  const manifest = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(files).map(([name, body]) => [name, sha1(body)]))));
  files['manifest.json'] = manifest;
  files['signature'] = signManifest(manifest, config);
  // Fecha fija en las entradas: el mismo pase produce el mismo ZIP (útil para ETag).
  return Buffer.from(zipSync(files, { level: 6, mtime: data.updatedAt }));
}

export function appleConfigFromEnv(env = process.env): AppleSignerConfig | null {
  const { APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT_PEM, APPLE_PASS_KEY_PEM, APPLE_WWDR_PEM, WALLET_PUBLIC_URL } = env;
  if (!APPLE_PASS_TYPE_ID || !APPLE_TEAM_ID || !APPLE_PASS_CERT_PEM || !APPLE_PASS_KEY_PEM || !APPLE_WWDR_PEM || !WALLET_PUBLIC_URL) return null;
  return {
    passTypeIdentifier: APPLE_PASS_TYPE_ID,
    teamIdentifier: APPLE_TEAM_ID,
    certificatePem: APPLE_PASS_CERT_PEM,
    privateKeyPem: APPLE_PASS_KEY_PEM,
    privateKeyPassphrase: env.APPLE_PASS_KEY_PASSPHRASE,
    wwdrPem: APPLE_WWDR_PEM,
    webServiceUrl: `${WALLET_PUBLIC_URL.replace(/\/$/, '')}/api/wallet/apple`,
  };
}
