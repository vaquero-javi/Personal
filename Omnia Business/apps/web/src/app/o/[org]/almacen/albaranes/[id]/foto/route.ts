import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

/**
 * Foto o PDF del albarán en papel, guardado al registrarlo. `?descargar=1` lo
 * entrega como archivo; sin él se muestra en el navegador.
 */
export async function GET(request: Request, ctx: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await ctx.params;
  const { ctx: tenant, can } = await requireOrg(org);
  if (!can('inventory.read')) return new Response('No tienes acceso al almacén', { status: 403 });

  const doc = await container().warehouse.receiptDocument(tenant, id).catch(() => null);
  if (!doc) return new Response('Este albarán no tiene foto', { status: 404 });

  const download = new URL(request.url).searchParams.has('descargar');
  return new Response(new Uint8Array(doc.content), {
    headers: {
      'Content-Type': doc.contentType,
      'Content-Length': String(doc.content.byteLength),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${doc.fileName.replace(/[^\w .-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
