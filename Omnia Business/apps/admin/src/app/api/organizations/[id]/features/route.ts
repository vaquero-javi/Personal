import { container } from '@/server/container';
import { handleAdmin } from '@/server/http';

/** GET /api/organizations/:id/features — matriz de módulos de una sociedad. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleAdmin(request, (userId) => container().entitlements.adminOrganizationFeatures(userId, id));
}
