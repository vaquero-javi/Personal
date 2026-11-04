import { after } from 'next/server';
import { container } from '@/server/container';
import { handle, readJson } from '@/server/http';

/** GET /api/v1/staff-discount-policies — política general y por rol. */
export async function GET(request: Request) {
  return handle(request, (ctx) => container().staffCards.policies(ctx));
}

/**
 * PUT /api/v1/staff-discount-policies
 * { roleId | null, discountPct, maxUsesPerDay | null, monthlyDiscountCap | null, requirePin, allowSelfService, isActive }
 * Cambiarla actualiza el porcentaje que muestran los pases (vía la cola).
 */
export async function PUT(request: Request) {
  const input = await readJson(request);
  const response = await handle(request, (ctx) => container().staffCards.savePolicy(ctx, input));
  after(() => container().staffCards.processWalletUpdates(50));
  return response;
}
