import { logger } from '@omnia/core';
import { container } from '@/server/container';

/**
 * Web service de Apple Wallet (PassKit). Apple llama a <webServiceURL>/v1/…:
 *
 *   POST   devices/{device}/registrations/{passType}/{serial}   registrar el móvil (body { pushToken })
 *   DELETE devices/{device}/registrations/{passType}/{serial}   el pase se ha borrado del móvil
 *   GET    devices/{device}/registrations/{passType}?passesUpdatedSince=…   ¿qué ha cambiado?
 *   GET    passes/{passType}/{serial}                           descargar la última versión
 *   POST   log                                                  errores que reporta el móvil
 *
 * Se autentica con «Authorization: ApplePass <authenticationToken>» del propio pase;
 * no hay sesión de usuario.
 */

const PASS_TYPE = process.env.APPLE_PASS_TYPE_ID;
const UUID = /^[0-9a-f-]{36}$/;
const authToken = (request: Request) => request.headers.get('authorization')?.match(/^ApplePass (.+)$/)?.[1] ?? '';
const plain = (status: number) => new Response(null, { status });

type Params = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: Params) {
  const path = (await params).path;
  const service = container().staffCards;

  // passes/{passType}/{serial}
  if (path.length === 3 && path[0] === 'passes' && path[1] === PASS_TYPE && UUID.test(path[2]!)) {
    const pass = await service.apple.latestPass(path[2]!, authToken(request));
    if (!pass) return plain(401);
    const since = request.headers.get('if-modified-since');
    const lastModified = new Date(Math.floor(pass.lastModified.getTime() / 1000) * 1000);
    if (since && new Date(since) >= lastModified) return plain(304);
    return new Response(new Uint8Array(pass.body), {
      headers: { 'content-type': 'application/vnd.apple.pkpass', 'last-modified': lastModified.toUTCString(), 'cache-control': 'no-store' },
    });
  }

  // devices/{device}/registrations/{passType}
  if (path.length === 4 && path[0] === 'devices' && path[2] === 'registrations' && path[3] === PASS_TYPE) {
    const since = new URL(request.url).searchParams.get('passesUpdatedSince');
    const changed = await service.apple.updatedSerials(path[1]!, since);
    return changed ? Response.json(changed) : plain(204);
  }
  return plain(404);
}

export async function POST(request: Request, { params }: Params) {
  const path = (await params).path;
  if (path.length === 1 && path[0] === 'log') {
    const body = (await request.json().catch(() => ({}))) as { logs?: string[] };
    logger.warn('apple wallet device log', { logs: body.logs?.slice(0, 20) });
    return plain(200);
  }
  if (path.length === 5 && path[0] === 'devices' && path[2] === 'registrations' && path[3] === PASS_TYPE && UUID.test(path[4]!)) {
    const { pushToken } = (await request.json().catch(() => ({}))) as { pushToken?: string };
    if (!pushToken) return plain(400);
    const result = await container().staffCards.apple.register(path[4]!, authToken(request), path[1]!, pushToken);
    return plain(result === 'created' ? 201 : result === 'exists' ? 200 : 401);
  }
  return plain(404);
}

export async function DELETE(request: Request, { params }: Params) {
  const path = (await params).path;
  if (path.length === 5 && path[0] === 'devices' && path[2] === 'registrations' && path[3] === PASS_TYPE && UUID.test(path[4]!)) {
    return plain((await container().staffCards.apple.unregister(path[4]!, authToken(request), path[1]!)) ? 200 : 401);
  }
  return plain(404);
}
