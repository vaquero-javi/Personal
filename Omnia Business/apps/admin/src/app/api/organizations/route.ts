import { container } from '@/server/container';
import { handleAdmin } from '@/server/http';

/** GET /api/organizations — todas las sociedades con sus módulos activos. */
export async function GET(request: Request) {
  return handleAdmin(request, (userId) => container().entitlements.adminOrganizations(userId));
}
