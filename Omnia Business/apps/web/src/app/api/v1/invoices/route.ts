import { container } from '@/server/container';
import { handle } from '@/server/http';

/**
 * GET /api/v1/invoices?direction=issued&status=unpaid&kind=ticket&search=…&partyId=…&limit=50&cursor=…
 *
 * Controlador fino: pasa la query string tal cual al caso de uso, que la valida
 * con Zod (422 si no cumple). Responde `{ items, nextCursor, outstandingTotal }`;
 * para la página siguiente se repite la petición con `cursor=<nextCursor>`.
 */
export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  return handle(request, (ctx) => container().invoicing.listPage(ctx, query));
}
