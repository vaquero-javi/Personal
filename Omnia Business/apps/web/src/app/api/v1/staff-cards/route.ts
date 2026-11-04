import { after } from 'next/server';
import { container } from '@/server/container';
import { handle, readJson } from '@/server/http';

/** GET /api/v1/staff-cards[?userId=] — tarjetas de la empresa (responsable) o las propias. */
export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get('userId') ?? undefined;
  return handle(request, (ctx) => container().staffCards.cards(ctx, userId ? { userId } : {}));
}

/**
 * POST /api/v1/staff-cards { userId, wallet: "apple" | "google" } — emite una tarjeta.
 * Si la persona ya tenía una viva en ese wallet, se revoca (y se avisa a su móvil).
 */
export async function POST(request: Request) {
  const input = await readJson(request);
  const response = await handle(request, (ctx) => container().staffCards.issue(ctx, input), { status: 201 });
  after(() => container().staffCards.processWalletUpdates(20));
  return response;
}
