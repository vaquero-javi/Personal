import { container } from '@/server/container';
import { handleAdmin, readJson } from '@/server/http';

/**
 * PUT /api/organizations/:id/features/:code { isActive, expiresAt? }
 * Devuelve la matriz recalculada (los hijos dependen del padre).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; code: string }> }) {
  const { id, code } = await params;
  const input = await readJson(request);
  return handleAdmin(request, async (userId) => ({
    features: await container().entitlements.adminSetFeature(userId, id, decodeURIComponent(code), input),
  }));
}
