import Link from 'next/link';
import { Notice } from '@/components/ui/form';
import { spineCss } from '@/components/shell/spines';
import { Window } from '@/components/shell/window';
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
    <Window>
      <header className="pt-4 md:pt-10">
        <p className="text-[13px] font-semibold tracking-[0.01em] text-ink-3 uppercase">{formatLongDate(new Date())} · {memberships.length} sociedades</p>
        <h1 className="mt-0.5 text-[28px] leading-[1.15] font-bold tracking-[-0.022em] md:text-[34px]">Vista de grupo</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-ink-3">
          Cifras consolidadas en una sola consulta. Cada sociedad se filtra con tus permisos en ella: los datos nunca se mezclan, solo se suman.
        </p>
      </header>
      {hidden.length > 0 && (
        <Notice tone="warning">Sin acceso a facturación en {hidden.map((h) => h.tradeName ?? h.legalName).join(', ')}: sus importes aparecen a cero.</Notice>
      )}
      <div className="rounded-[var(--radius-card)] bg-sheet shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto px-4 py-4 md:px-5">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="text-[12px] text-ink-3">
                <th scope="col" className="border-b border-line-soft px-2 pb-2 text-left font-medium">Sociedad</th>
                {cols.map(([, label]) => (
                  <th key={label} scope="col" className="border-b border-line-soft px-2 pb-2 text-right font-medium">{label}</th>
                ))}
                <th scope="col" className="border-b border-line-soft px-2 pb-2 text-right font-medium">Bajo mínimos</th>
                <th scope="col" className="border-b border-line-soft px-2 pb-2 text-right font-medium">Incidencias</th>
              </tr>
            </thead>
            <tbody>
              {figures.map((f) => {
                const m = byId.get(f.organizationId)!;
                return (
                  <tr key={f.organizationId} className="hover:bg-fill/60">
                    <th scope="row" className="border-b border-line-soft px-2 py-2.5 text-left font-medium">
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: spineCss(m.spineColor) }} />
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
              <tr className="font-semibold">
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
    </Window>
  );
}
