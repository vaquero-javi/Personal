import { container } from '@/server/container';
import { handle } from '@/server/http';

/** GET /api/v1/pos/catalog?warehouse=<uuid> — artículos, precio de tarifa general y existencias para el TPV. */
export async function GET(request: Request) {
  const warehouseId = new URL(request.url).searchParams.get('warehouse') ?? '';
  return handle(request, (ctx) => container().sales.posCatalog(ctx, warehouseId));
}
