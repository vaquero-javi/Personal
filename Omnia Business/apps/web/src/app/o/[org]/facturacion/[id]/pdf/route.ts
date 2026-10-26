import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { InvoicePdf } from '@/features/invoicing/invoice-pdf';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { qrDataUrl, verifactuUrl } from '@/server/verifactu-qr';

/**
 * Factura en A4 (PDF). `?descargar=1` la entrega como archivo; sin él se abre
 * en el navegador (y en la vista previa de la ficha).
 */
export async function GET(request: Request, ctx: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await ctx.params;
  const { ctx: tenant, can } = await requireOrg(org);
  if (!can('invoicing.read')) return new Response('No tienes acceso a facturación', { status: 403 });

  const svc = container();
  const invoice = await svc.invoicing.get(tenant, id).catch(() => null);
  if (!invoice || invoice.direction !== 'issued') return new Response('Factura no encontrada', { status: 404 });
  const organization = await svc.organizations.get(tenant);
  const party = !invoice.partySnapshot && invoice.partyId ? await svc.parties.get(tenant, invoice.partyId) : null;

  const issuer = invoice.issuerSnapshot ?? { legalName: organization.legalName, taxId: organization.taxId };
  const qr =
    invoice.status !== 'draft' && organization.fiscalRegime === 'verifactu' && invoice.fullNumber && invoice.issueDate && issuer.taxId
      ? await qrDataUrl(
          verifactuUrl({
            taxId: issuer.taxId,
            fullNumber: invoice.fullNumber,
            issueDate: invoice.issueDate,
            amount: String(Number(invoice.subtotal) + Number(invoice.taxTotal)),
          }),
        )
      : null;

  const pdf = await renderToBuffer(
    createElement(InvoicePdf, {
      invoice,
      issuerLive: {
        legalName: organization.legalName,
        tradeName: organization.tradeName,
        taxId: organization.taxId,
        address: organization.fiscalAddress,
        iban: organization.iban,
      },
      partyLive: party ? { legalName: party.legalName, ...(party.taxId ? { taxId: party.taxId } : {}), address: party.billingAddress } : null,
      qr,
    }) as unknown as ReactElement<DocumentProps>, // InvoicePdf devuelve un <Document>
  );

  const name = invoice.fullNumber ? `Factura ${invoice.fullNumber}.pdf` : `Borrador de factura ${invoice.id.slice(0, 8)}.pdf`;
  const download = new URL(request.url).searchParams.has('descargar');
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name.replace(/[^\w .-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
