import { container } from '@/server/container';
import { requireShift } from '@/server/session';
import { PrintControls } from '@/features/print-controls';
import { formatQty, formatTime } from '@/lib/format';

export const metadata = { title: 'Comanda · Omnia TPV' };

/**
 * Comanda para barra/cocina: qué preparar y para quién. Mesa y cliente bien
 * grandes, lo enviado en este envío (o el último), con notas y sin precios.
 */
export default async function KitchenTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ envio?: string }> }) {
  const { id } = await params;
  const { envio } = await searchParams;
  const { ctx } = await requireShift();
  const ticket = await container().pos.kitchenTicket(ctx, id, envio ?? null);
  const where = ticket.tableName ? `MESA ${ticket.tableName}` : (ticket.label ?? `CUENTA ${ticket.number}`).toUpperCase();
  return (
    <div className="flex flex-col items-center">
      <PrintControls back={`/cuenta/${id}`} />
      <article className="w-[80mm] bg-white px-4 py-5 font-mono text-[12px] leading-snug text-black print:w-full print:px-0">
        <header className="text-center">
          <p className="font-bold tracking-[0.2em]">COMANDA</p>
          <p className="mt-2 text-[26px] leading-tight font-bold">{where}</p>
          {ticket.customerName && <p className="mt-1 text-[20px] leading-tight font-bold">{ticket.customerName}</p>}
          <p className="mt-2">
            {ticket.sentAt ? formatTime(ticket.sentAt) : ''} · {ticket.tableArea ? `${ticket.tableArea} · ` : ''}
            {ticket.guests} {ticket.guests === 1 ? 'comensal' : 'comensales'}
          </p>
          <p>Camarero: {ticket.waiterName}</p>
        </header>
        <hr className="my-3 border-dashed border-black" />
        {ticket.lines.length === 0 ? (
          <p className="text-center">Nada enviado todavía.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ticket.lines.map((l, i) => (
              <li key={i} className="text-[15px]">
                <span className="font-bold">{formatQty(l.quantity)} ×</span> {l.description}
                {l.note && <span className="block pl-6 text-[13px] font-bold">» {l.note}</span>}
              </li>
            ))}
          </ul>
        )}
        <hr className="my-3 border-dashed border-black" />
        <p className="text-center">Cuenta nº {ticket.number}</p>
      </article>
    </div>
  );
}
