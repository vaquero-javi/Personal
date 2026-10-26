import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

/**
 * El documento de una nómina. Solo lo obtiene su titular o RRHH (lo decide
 * la RLS). `?descargar=1` lo entrega como archivo.
 */
export async function GET(request: Request, ctx: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await ctx.params;
  const { ctx: tenant } = await requireOrg(org);

  const doc = await container().payroll.file(tenant, id).catch(() => null);
  if (!doc) return new Response('Nómina no encontrada', { status: 404 });

  const download = new URL(request.url).searchParams.has('descargar');
  return new Response(new Uint8Array(doc.content), {
    headers: {
      'Content-Type': doc.contentType,
      'Content-Length': String(doc.content.byteLength),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${doc.fileName.replace(/[^\w .-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
