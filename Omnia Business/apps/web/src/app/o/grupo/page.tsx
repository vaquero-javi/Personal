import Link from 'next/link';
import { Notice } from '@/components/ui/form';
import { spineClasses } from '@/components/shell/spines';
import { formatEuro, formatLongDate } from '@/lib/format';
import { groupFigures } from '@/server/queries/group';
import { myMemberships, requireUserId } from '@/server/session';
import { hasPermission } from '@omnia/organizations';

export const metadata = { title: 'Vista de grupo · Omnia' };

const sum = (rows: { [k: string]: unknown }[], key: string) => rows.reduce((s, r) => s + Number(r[key]), 0);

export default async function GroupPage() {
  const userId = await requireUserId();
  const memberships = await myMemberships();
  const [first, ...rest] = memberships.map((m) => m.organizationId);
  const figures = first ? await groupFigures({ userId, organizationIds: [first, ...rest] }) : [];
  const byId = new Map(memberships.map((m) => [m.organizationId, m]));
  const hidden = memberships.filter((m) => !hasPermission(m.permissions, 'invoicing.read'));

  const cols = [
    ['pending', 'Pendiente de cobro'],
    ['overdue', 'Vencido'],
    ['collectedMonth', 'Cobrado este mes'],
    ['issuedMonth', 'Facturado este mes'],
    ['payable', 'Pendiente de pago'],
    ['stockValue', 'Valor de stock'],
  ] as const;

  return (
    <main className="flex min-w-0 flex-1 flex-col px-3 pt-3 md:overflow-hidden md:px-6 md:pt-4 md:pl-[18px]">
      <header className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 md:h-10">
        <h1 className="text-lg font-bold md:text-xl">Vista de grupo</h1>
        <p className="text-ink-3">{formatLongDate(new Date())} · {memberships.length} sociedades</p>
      </header>
      <div className="mt-3.5 flex flex-1 flex-col rounded-tr-lg border border-shelf-edge bg-sheet md:overflow-y-auto">
        <p className="border-b border-line px-4 py-3 text-sm text-ink-2 md:px-5">
          Cifras consolidadas en una sola consulta. Cada sociedad se filtra con tus permisos en ella: los datos nunca se mezclan, solo se suman.
        </p>
        {hidden.length > 0 && (
          <div className="px-4 pt-4 md:px-5">
            <Notice tone="warning">Sin acceso a facturación en {hidden.map((h) => h.tradeName ?? h.legalName).join(', ')}: sus importes aparecen a cero.</Notice>
          </div>
        )}
        <div className="overflow-x-auto px-4 py-4 md:px-5">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="bg-sheet-head text-xs text-ink-3">
                <th scope="col" className="border-b border-line px-2 py-2 text-left font-semibold">Sociedad</th>
                {cols.map(([, label]) => (
                  <th key={label} scope="col" className="border-b border-line px-2 py-2 text-right font-semibold">{label}</th>
                ))}
                <th scope="col" className="border-b border-line px-2 py-2 text-right font-semibold">Bajo mínimos</th>
                <th scope="col" className="border-b border-line px-2 py-2 text-right font-semibold">Incidencias</th>
              </tr>
            </thead>
            <tbody>
              {figures.map((f) => {
                const m = byId.get(f.organizationId)!;
                return (
                  <tr key={f.organizationId} className="hover:bg-sheet-head">
                    <th scope="row" className="border-b border-line-soft px-2 py-2.5 text-left font-medium">
                      <span className="flex items-center gap-2">
                        <span aria-hidden className={`h-5 w-2 rounded-sm ${spineClasses[m.spineColor].bg}`} />
                        <Link href={`/o/${m.slug}`} className="underline-offset-2 hover:underline">{m.legalName}</Link>
                      </span>
                    </th>
                    {cols.map(([key]) => (
                      <td key={key} className={`border-b border-line-soft px-2 py-2.5 text-right ${key === 'overdue' && Number(f.overdue) > 0 ? 'font-semibold text-danger' : ''}`}>
                        {formatEuro(f[key])}
                      </td>
                    ))}
                    <td className={`border-b border-line-soft px-2 py-2.5 text-right ${f.lowStock ? 'font-semibold text-danger' : 'text-ink-3'}`}>{f.lowStock}</td>
                    <td className="border-b border-line-soft px-2 py-2.5 text-right">{f.openIncidents}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <th scope="row" className="px-2 py-3 text-left">Total grupo</th>
                {cols.map(([key]) => (
                  <td key={key} className="px-2 py-3 text-right">{formatEuro(sum(figures as never, key))}</td>
                ))}
                <td className="px-2 py-3 text-right">{sum(figures as never, 'lowStock')}</td>
                <td className="px-2 py-3 text-right">{sum(figures as never, 'openIncidents')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </main>
  );
}
