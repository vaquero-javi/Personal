import { container } from '@/server/container';
import { handle } from '@/server/http';

/** POST /api/v1/goods-receipts/:id/post — contabiliza el albarán (entrada de stock). Idempotente. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(request, (ctx) => container().goodsReceipts.post(ctx, id));
}
