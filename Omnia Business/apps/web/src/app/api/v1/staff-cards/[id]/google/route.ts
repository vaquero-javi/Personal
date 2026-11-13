import { container } from '@/server/container';
import { STAFF_CARDS } from '@/server/features';
import { handle } from '@/server/http';

/** GET /api/v1/staff-cards/:id/google — { url } del botón «Añadir a Google Wallet». */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(request, async (ctx) => ({ url: await container().staffCards.googleSaveUrl(ctx, id) }), { feature: STAFF_CARDS });
}
