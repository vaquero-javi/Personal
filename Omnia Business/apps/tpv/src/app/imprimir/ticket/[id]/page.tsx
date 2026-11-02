import { container } from '@/server/container';
import { requireShift } from '@/server/session';
import { qrSvg, verifactuUrl } from '@/server/verifactu-qr';
import { PrintControls } from '@/features/print-controls';
import { formatDateTime, formatEuro, formatQty } from '@/lib/format';

export const metadata = { title: 'Ticket · Omnia TPV' };

export default async function TicketPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ volver?: string }> }) {
  const [{ id }, { volver }] = await Promise.all([params, searchParams]);
  const { ctx } = await requireShift();
  const t = await container().pos.ticket(ctx, id);
  const qr = t.verifactu && t.issuer.taxId ? await qrSvg(verifactuUrl({ taxId: t.issuer.taxId, fullNumber: t.fullNumber, issueDate: t.issueDate, amount: t.total })) : null;
  return (
    <div className="flex flex-col items-center">
      <PrintControls back={volver === 'tickets' ? '/tickets' : '/mesas'} />
      <article className="w-[80mm] bg-white px-4 py-5 font-mono text-[12px] leading-snug text-black print:w-full print:px-0">
        <header className="text-center">
          <p className="text-[14px] font-bold">{t.issuer.tradeName ?? t.issuer.legalName}</p>
          {t.issuer.tradeName && <p>{t.issuer.legalName}</p>}
          <p>NIF {t.issuer.taxId}</p>
          {t.issuer.address?.line && <p>{t.issuer.address.line}</p>}
          {t.issuer.address?.city && <p>{[t.issuer.address.postalCode, t.issuer.address.city].filter(Boolean).join(' ')}</p>}
          <p className="mt-2 font-bold">FACTURA SIMPLIFICADA</p>
          <p>{t.fullNumber}</p>
          <p>{formatDateTime(t.fiscalRecordAt)}</p>
          {(t.tableName || t.waiterName) && <p>{[t.tableName && `Mesa ${t.tableName}`, t.waiterName && `Le atendió ${t.waiterName}`].filter(Boolean).join(' · ')}</p>}
        </header>
        <hr className="my-3 border-dashed border-black" />
        <table className="w-full">
          <tbody>
            {t.lines.map((l, i) => (
              <tr key={i} className="align-top">
                <td className="w-8">{formatQty(l.quantity)}</td>
                <td>{l.description}</td>
                <td className="text-right">{formatEuro(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="my-3 border-dashed border-black" />
        <p className="flex justify-between text-[16px] font-bold">
          <span>TOTAL</span>
          <span>{formatEuro(t.total)}</span>
        </p>
        <table className="mt-2 w-full">
          <thead>
            <tr>
              <th className="text-left font-normal">IVA</th>
              <th className="text-right font-normal">Base</th>
              <th className="text-right font-normal">Cuota</th>
            </tr>
          </thead>
          <tbody>
            {t.taxes.map((x) => (
              <tr key={x.rate}>
                <td>{formatQty(x.rate)} %</td>
                <td className="text-right">{formatEuro(x.base)}</td>
                <td className="text-right">{formatEuro(x.tax)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {t.method && <p className="mt-2">Pago: {t.method === 'card' ? 'tarjeta' : t.method === 'cash' ? 'efectivo' : t.method}</p>}
        {qr && (
          <div className="mt-4 flex flex-col items-center gap-1 text-center">
            <p className="font-bold">QR tributario</p>
            <div className="w-32" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="text-[10px]">VERI*FACTU</p>
          </div>
        )}
        <p className="mt-4 text-center">¡Gracias por su visita!</p>
      </article>
    </div>
  );
}
