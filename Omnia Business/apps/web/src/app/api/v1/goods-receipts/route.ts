import { container } from '@/server/container';
import { handle, readJson } from '@/server/http';

/** POST /api/v1/goods-receipts — registra un albarán de proveedor en borrador. */
export async function POST(request: Request) {
  const input = await readJson(request);
  return handle(request, (ctx) => container().goodsReceipts.create(ctx, input), { status: 201 });
}
