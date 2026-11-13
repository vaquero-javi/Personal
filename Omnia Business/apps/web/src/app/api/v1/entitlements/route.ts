import { container } from '@/server/container';
import { handle } from '@/server/http';

/**
 * GET /api/v1/entitlements — módulos efectivos de la sociedad activa
 * (cabecera x-organization-id). Solo la propia: la sociedad sale de las
 * membresías verificadas, nunca de un parámetro, así que no hay IDOR posible.
 */
export async function GET(request: Request) {
  return handle(request, (ctx) => container().entitlements.forOrganization(ctx));
}
