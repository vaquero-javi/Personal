import { container } from '@/server/container';
import { requireShift } from '@/server/session';
import { PrintControls } from '@/features/print-controls';
import { formatDateTime, formatEuro, formatQty } from '@/lib/format';

export const metadata = { title: 'Pre-ticket · Omnia TPV' };

/** Cuenta para el cliente antes de cobrar: no es factura ni tiene valor fiscal. */
export default async function PrecheckPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, terminal } = await requireShift();
  const tab = await container().pos.tab(ctx, id);
  return (
    <div className="flex flex-col items-center">
      <PrintControls back={`/cuenta/${id}`} />
      <article className="w-[80mm] bg-white px-4 py-5 font-mono text-[12px] leading-snug text-black print:w-full print:px-0">
        <header className="text-center">
          <p className="text-[14px] font-bold">{terminal.orgName}</p>
          <p className="mt-2 font-bold">CUENTA · {tab.table ? `MESA ${tab.table.name}` : tab.label}</p>
          <p>{formatDateTime(tab.precheckAt ?? new Date())} · {tab.guests} {tab.guests === 1 ? 'comensal' : 'comensales'}</p>
          <p>Le atendió {tab.waiterName}</p>
        </header>
        <hr className="my-3 border-dashed border-black" />
        <table className="w-full">
          <tbody>
            {tab.lines.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="w-8">{formatQty(l.quantity)}</td>
                <td>
                  {l.description}
                  {Number(l.discountPct) > 0 && ` (−${formatQty(l.discountPct)} %)`}
                </td>
                <td className="text-right">{formatEuro(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="my-3 border-dashed border-black" />
        <p className="flex justify-between text-[16px] font-bold">
          <span>TOTAL</span>
          <span>{formatEuro(tab.totals.total)}</span>
        </p>
        <p className="text-right">IVA incluido</p>
        {tab.guests > 1 && <p className="mt-1 text-right">Por persona: {formatEuro(Number(tab.totals.total) / tab.guests)}</p>}
        <p className="mt-4 text-center">Documento sin validez fiscal. Pida su factura simplificada al pagar.</p>
      </article>
    </div>
  );
}
