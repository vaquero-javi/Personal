import { timingSafeEqual } from 'node:crypto';
import { container } from '@/server/container';

/**
 * GET /api/cron/wallet-updates — vacía la cola de avisos a Apple/Google.
 * Lo llama el cron de Vercel con «Authorization: Bearer $CRON_SECRET».
 * Las rutas que cambian tarjetas ya lo intentan al momento; esto recoge los reintentos.
 */
export async function GET(request: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ''}`);
  const actual = Buffer.from(request.headers.get('authorization') ?? '');
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return new Response(null, { status: 401 });
  }
  return Response.json(await container().staffCards.processWalletUpdates(200));
}
