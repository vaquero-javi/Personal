import { container } from '@/server/container';
import { handleAdmin, readJson } from '@/server/http';

/**
 * PUT /api/organizations/:id/features/:code/visibility { hidden }
 * Oculto: si la sociedad no tiene el módulo, no lo ve ni con candado ni lo puede pedir.
 * Devuelve la matriz recalculada (ocultar un padre oculta sus hijos).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; code: string }> }) {
  const { id, code } = await params;
  const input = await readJson(request);
  return handleAdmin(request, async (userId) => ({
    features: await container().entitlements.adminSetFeatureHidden(userId, id, decodeURIComponent(code), input),
  }));
}
