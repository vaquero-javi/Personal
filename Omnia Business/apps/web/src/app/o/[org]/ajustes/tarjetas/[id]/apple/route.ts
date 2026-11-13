import { isDomainError } from '@omnia/core';
import { container } from '@/server/container';
import { FEATURES } from '@/server/features';
import { requireOrg } from '@/server/session';

/** Descarga del .pkpass desde «Tu tarjeta»: el iPhone lo abre directamente en Wallet. */
export async function GET(_request: Request, { params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const { ctx, has } = await requireOrg(org);
  if (!has(FEATURES.staffCards)) return new Response('Módulo no contratado', { status: 403 });
  try {
    const pass = await container().staffCards.applePass(ctx, id);
    return new Response(new Uint8Array(pass), {
      headers: {
        'content-type': 'application/vnd.apple.pkpass',
        'content-disposition': 'attachment; filename="omnia-empleado.pkpass"',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if (isDomainError(error)) return new Response(error.message, { status: error.code === 'NOT_FOUND' ? 404 : 409 });
    throw error;
  }
}
