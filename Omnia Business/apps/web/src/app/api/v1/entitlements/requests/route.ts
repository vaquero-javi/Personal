import { container } from '@/server/container';
import { handle, readJson } from '@/server/http';

/** POST /api/v1/entitlements/requests { featureCode, message? } — pedir a Omnia que active un módulo (org.manage). */
export async function POST(request: Request) {
  const input = await readJson(request);
  return handle(request, (ctx) => container().entitlements.request(ctx, input), { status: 201 });
}
