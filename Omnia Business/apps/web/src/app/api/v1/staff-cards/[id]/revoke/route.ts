import { after } from 'next/server';
import { container } from '@/server/container';
import { handle, readJson } from '@/server/http';

/**
 * POST /api/v1/staff-cards/:id/revoke { reason } — efecto inmediato en el TPV.
 * El aviso al móvil (pase anulado) se intenta en cuanto se responde; si falla,
 * lo reintenta el cron de la cola.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = await readJson(request);
  const response = await handle(request, async (ctx) => {
    await container().staffCards.revoke(ctx, id, input);
    return { revoked: true };
  });
  after(() => container().staffCards.processWalletUpdates(20));
  return response;
}
