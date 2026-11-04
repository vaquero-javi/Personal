import { container } from '@/server/container';
import { handle } from '@/server/http';

/** GET /api/v1/staff-cards/:id/apple — descarga el .pkpass (titular o responsable). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let pass: Buffer | undefined;
  // handle() autentica, resuelve la empresa y da el error en problem+json si falla.
  const response = await handle(request, async (ctx) => {
    pass = await container().staffCards.applePass(ctx, id);
    return null;
  });
  if (!pass) return response;
  return new Response(new Uint8Array(pass), {
    headers: {
      'content-type': 'application/vnd.apple.pkpass',
      'content-disposition': 'attachment; filename="omnia-empleado.pkpass"',
      'cache-control': 'no-store',
    },
  });
}
