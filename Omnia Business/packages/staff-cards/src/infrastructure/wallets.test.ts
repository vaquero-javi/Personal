import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from 'jose';
import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { buildPkpass, type AppleSignerConfig, type StaffPassData } from './apple-pass';
import { buildGenericObject, saveUrl, type GoogleWalletConfig } from './google-wallet';
import { createSecretBox } from './secret-box';
import { googleQrPattern } from '../domain/credential';

/** CA de pruebas (hace de «Apple WWDR») y certificado de pase firmado por ella. */
function testCertificates() {
  const make = (subject: string, issuer: forge.pki.Certificate | null, issuerKey: forge.pki.rsa.PrivateKey | null, ca: boolean) => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = String(Math.floor(Math.random() * 1e9));
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 86_400_000);
    cert.setSubject([{ name: 'commonName', value: subject }]);
    cert.setIssuer(issuer ? issuer.subject.attributes : [{ name: 'commonName', value: subject }]);
    cert.setExtensions([{ name: 'basicConstraints', cA: ca }, { name: 'keyUsage', digitalSignature: true, keyCertSign: ca }]);
    cert.sign(issuerKey ?? keys.privateKey, forge.md.sha256.create());
    return { cert, key: keys.privateKey };
  };
  const ca = make('Test WWDR', null, null, true);
  const leaf = make('Pass Type ID: pass.com.omnia.test', ca.cert, ca.key, false);
  return {
    caPem: forge.pki.certificateToPem(ca.cert),
    certPem: forge.pki.certificateToPem(leaf.cert),
    keyPem: forge.pki.privateKeyToPem(leaf.key),
  };
}

const passData = (overrides: Partial<StaffPassData> = {}): StaffPassData => ({
  cardId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  version: 1,
  authenticationToken: 'a'.repeat(43),
  qrMessage: 'OMN1:7c9e6679-7425-40de-944b-e07fc1f90ae7:' + 'b'.repeat(43),
  holderName: 'Marta Ruiz',
  roleName: 'Camarero',
  orgName: 'Bar La Plaza',
  discountPct: '20.00',
  revoked: false,
  updatedAt: new Date('2026-11-04T10:00:00Z'),
  ...overrides,
});

describe('Apple Wallet (.pkpass)', () => {
  const certs = testCertificates();
  const config: AppleSignerConfig = {
    passTypeIdentifier: 'pass.com.omnia.test',
    teamIdentifier: 'TEAM123456',
    certificatePem: certs.certPem,
    privateKeyPem: certs.keyPem,
    wwdrPem: certs.caPem,
    webServiceUrl: 'https://omnia.example/api/wallet/apple',
  };
  const icon = Buffer.from('fake-png');

  it('empaqueta pass.json, imágenes, manifiesto con SHA-1 y firma', () => {
    const files = unzipSync(buildPkpass(config, passData(), { 'icon.png': icon }));
    expect(Object.keys(files).sort()).toEqual(['icon.png', 'manifest.json', 'pass.json', 'signature']);
    const manifest = JSON.parse(Buffer.from(files['manifest.json']!).toString());
    for (const name of ['pass.json', 'icon.png']) {
      expect(manifest[name]).toBe(createHash('sha1').update(files[name]!).digest('hex'));
    }
    const pass = JSON.parse(Buffer.from(files['pass.json']!).toString());
    expect(pass).toMatchObject({
      formatVersion: 1,
      serialNumber: passData().cardId,
      sharingProhibited: true,
      voided: false,
      barcodes: [{ format: 'PKBarcodeFormatQR', message: passData().qrMessage }],
    });
  });

  it('la firma PKCS#7 la acepta OpenSSL con la cadena del certificado', () => {
    const files = unzipSync(buildPkpass(config, passData(), { 'icon.png': icon }));
    const dir = mkdtempSync(join(tmpdir(), 'pkpass-'));
    writeFileSync(join(dir, 'manifest.json'), files['manifest.json']!);
    writeFileSync(join(dir, 'signature'), files['signature']!);
    writeFileSync(join(dir, 'ca.pem'), certs.caPem);
    const out = execFileSync('openssl', [
      'smime', '-verify', '-binary', '-inform', 'DER', '-in', join(dir, 'signature'),
      '-content', join(dir, 'manifest.json'), '-CAfile', join(dir, 'ca.pem'), '-out', '/dev/null',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    expect(out).toBeDefined(); // execFileSync lanza si la verificación falla

    // Y alterar el manifiesto rompe la firma.
    writeFileSync(join(dir, 'manifest.json'), Buffer.concat([files['manifest.json']!, Buffer.from(' ')]));
    expect(() => execFileSync('openssl', [
      'smime', '-verify', '-binary', '-inform', 'DER', '-in', join(dir, 'signature'),
      '-content', join(dir, 'manifest.json'), '-CAfile', join(dir, 'ca.pem'), '-out', '/dev/null',
    ], { stdio: 'pipe' })).toThrow();
  });

  it('un pase revocado queda anulado y sin QR', () => {
    const files = unzipSync(buildPkpass(config, passData({ revoked: true, qrMessage: null }), { 'icon.png': icon }));
    const pass = JSON.parse(Buffer.from(files['pass.json']!).toString());
    expect(pass.voided).toBe(true);
    expect(pass.barcodes).toBeUndefined();
  });
});

describe('Google Wallet', () => {
  it('objeto con QR rotativo TOTP y capturas bloqueadas', () => {
    const config: GoogleWalletConfig = { issuerId: '3388000000012345678', serviceAccountEmail: 'sa@x.iam.gserviceaccount.com', privateKeyPem: '', publicUrl: 'https://omnia.example' };
    const object = buildGenericObject(config, {
      cardId: 'abc', totpSeedHex: 'ff'.repeat(20), qrPattern: googleQrPattern('abc'),
      holderName: 'Marta Ruiz', roleName: 'Camarero', orgName: 'Bar La Plaza', discountPct: '20.00', revoked: false,
    });
    expect(object).toMatchObject({
      id: '3388000000012345678.staff_abc',
      state: 'ACTIVE',
      passConstraints: { screenshotEligibility: 'INELIGIBLE' },
      rotatingBarcode: {
        type: 'QR_CODE',
        valuePattern: 'OMN1:abc:{totp_value_0}',
        totpDetails: { periodMillis: '30000', algorithm: 'TOTP_SHA1', parameters: [{ key: 'ff'.repeat(20), valueLength: 8 }] },
      },
    });
    const revoked = buildGenericObject(config, { ...{ cardId: 'abc', totpSeedHex: 'ff', qrPattern: '', holderName: '', roleName: '', orgName: '', discountPct: null }, revoked: true });
    expect(revoked.state).toBe('INACTIVE');
    expect('rotatingBarcode' in revoked).toBe(false);
  });

  it('el enlace de guardado es un JWT RS256 que solo referencia el objeto (sin la semilla)', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    const config: GoogleWalletConfig = { issuerId: '3388', serviceAccountEmail: 'sa@x.iam.gserviceaccount.com', privateKeyPem: await exportPKCS8(privateKey), publicUrl: 'https://omnia.example' };
    const url = await saveUrl(config, 'card-1', ['https://omnia.example']);
    const jwt = url.replace('https://pay.google.com/gp/v/save/', '');
    const { payload } = await jwtVerify(jwt, await importSPKI(await exportSPKI(publicKey), 'RS256'), { issuer: config.serviceAccountEmail, audience: 'google' });
    expect(payload).toMatchObject({ typ: 'savetowallet', payload: { genericObjects: [{ id: '3388.staff_card-1', classId: '3388.omnia_staff_card' }] } });
    expect(JSON.stringify(payload)).not.toContain('totp');
  });
});

describe('cifrado de secretos', () => {
  it('ida y vuelta, y detecta manipulación', () => {
    const box = createSecretBox(Buffer.alloc(32, 7).toString('base64'));
    const sealed = box.seal(Buffer.from('semilla'));
    expect(box.open(sealed).toString()).toBe('semilla');
    sealed[sealed.length - 1]! ^= 1;
    expect(() => box.open(sealed)).toThrow();
  });

  it('el token derivado es estable y distinto por propósito', () => {
    const box = createSecretBox(Buffer.alloc(32, 7).toString('base64'));
    expect(box.derive('a', 'x')).toBe(box.derive('a', 'x'));
    expect(box.derive('a', 'x')).not.toBe(box.derive('b', 'x'));
  });

  it('exige una clave de 32 bytes', () => {
    expect(() => createSecretBox(Buffer.alloc(16).toString('base64'))).toThrow();
  });
});
