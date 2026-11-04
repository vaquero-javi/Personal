import { connect, type ClientHttp2Session } from 'node:http2';

/**
 * Push de Apple Wallet: un aviso vacío al token que registró el móvil. Wallet
 * responde pidiendo al web service qué pases han cambiado y se descarga la
 * versión nueva. Los pases de Wallet usan el certificado del Pass Type ID
 * (autenticación por certificado), con el passTypeIdentifier como apns-topic.
 */

export interface ApnsResult {
  token: string;
  ok: boolean;
  /** El token ya no vale (pase borrado del móvil): hay que olvidarlo. */
  gone: boolean;
  status: number;
  reason?: string;
}

export interface ApnsConfig {
  passTypeIdentifier: string;
  certificatePem: string;
  privateKeyPem: string;
  privateKeyPassphrase?: string | undefined;
  /** api.push.apple.com en producción (los pases siempre usan producción). */
  host?: string;
}

export async function sendWalletPushes(config: ApnsConfig, tokens: string[]): Promise<ApnsResult[]> {
  if (tokens.length === 0) return [];
  const session: ClientHttp2Session = connect(`https://${config.host ?? 'api.push.apple.com'}:443`, {
    cert: config.certificatePem,
    key: config.privateKeyPem,
    ...(config.privateKeyPassphrase ? { passphrase: config.privateKeyPassphrase } : {}),
  });
  try {
    // Una sola conexión HTTP/2 multiplexa todos los avisos.
    return await Promise.all(
      tokens.map(
        (token) =>
          new Promise<ApnsResult>((resolve) => {
            const request = session.request({
              ':method': 'POST',
              ':path': `/3/device/${token}`,
              'apns-topic': config.passTypeIdentifier,
              'content-type': 'application/json',
            });
            let status = 0;
            let body = '';
            request.on('response', (headers) => (status = Number(headers[':status'])));
            request.on('data', (chunk: Buffer) => (body += chunk.toString()));
            request.on('end', () => {
              const reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined;
              resolve({ token, ok: status === 200, gone: status === 410 || reason === 'BadDeviceToken', status, ...(reason ? { reason } : {}) });
            });
            request.on('error', (error) => resolve({ token, ok: false, gone: false, status: 0, reason: error.message }));
            request.end('{}');
          }),
      ),
    );
  } finally {
    session.close();
  }
}
