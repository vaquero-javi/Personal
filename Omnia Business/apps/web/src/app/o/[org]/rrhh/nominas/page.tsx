import { Download } from 'lucide-react';
import { Badge, Cell, EmptyState, PageHeader, Ruled } from '@/components/ui/layout';
import { buttonClass } from '@/components/ui/button-styles';
import { formatEuro, formatMonth } from '@/lib/format';
import { payslipKind } from '@/lib/labels';
import { container } from '@/server/container';
import { me, requireOrg } from '@/server/session';

export const metadata = { title: 'Mis nóminas · Omnia' };

export default async function MyPayslipsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, org: membership } = await requireOrg(org);
  const [payslips, user] = await Promise.all([container().payroll.mine(ctx), me()]);
  const file = (id: string) => `/o/${org}/rrhh/nominas/${id}/archivo`;

  const years = [...new Set(payslips.map((p) => p.period.slice(0, 4)))];
  const unread = payslips.filter((p) => !p.viewedAt).length;

  return (
    <>
      <PageHeader
        title="Mis nóminas"
        description={`Las ves al entrar con tu cuenta ${user.email}. Aparte de ti, solo las ve quien gestiona las nóminas en ${membership.legalName}${membership.legalName.endsWith('.') ? '' : '.'}`}
      />
      {payslips.length === 0 ? (
        <Ruled cols="">
          <Cell>
            <EmptyState title="Todavía no tienes nóminas aquí">
              Cuando RRHH suba tu nómina de cada mes aparecerá en esta página y podrás verla o descargarla cuando quieras.
            </EmptyState>
          </Cell>
        </Ruled>
      ) : (
        <Ruled cols="">
          {unread > 0 && (
            <Cell>
              <p className="text-sm text-ink-2">
                Tienes <span className="font-semibold text-ink">{unread === 1 ? 'una nómina nueva' : `${unread} nóminas nuevas`}</span> sin abrir.
              </p>
            </Cell>
          )}
          {years.map((year) => {
            const ofYear = payslips.filter((p) => p.period.startsWith(year));
            const net = ofYear.reduce((sum, p) => sum + Number(p.netAmount ?? 0), 0);
            const withAmount = ofYear.some((p) => p.netAmount !== null);
            return (
              <Cell
                key={year}
                title={year}
                actions={withAmount ? <span className="text-sm text-ink-2">Líquido percibido <span className="font-semibold text-ink">{formatEuro(net)}</span></span> : undefined}
              >
                {/* Lista y no tabla: casi siempre se mira desde el móvil. */}
                <ul className="-mx-4 divide-y divide-line-soft border-t border-line-soft md:-mx-5">
                  {ofYear.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
                      <div className="min-w-0 flex-1">
                        <a href={file(p.id)} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">
                          {formatMonth(p.period)}
                        </a>
                        {!p.viewedAt && <span className="ml-2"><Badge tone="info">Nueva</Badge></span>}
                        <span className="block text-xs text-ink-3">{payslipKind[p.kind]}</span>
                      </div>
                      {p.netAmount && <span className="text-sm font-semibold tabular-nums">{formatEuro(p.netAmount)}</span>}
                      <div className="flex shrink-0 gap-1">
                        <a href={file(p.id)} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'h-8 px-3')}>
                          Ver
                        </a>
                        <a href={`${file(p.id)}?descargar=1`} download className={buttonClass('ghost', 'h-8 px-2')} aria-label={`Descargar ${payslipKind[p.kind]?.toLowerCase()} de ${formatMonth(p.period)}`}>
                          <Download aria-hidden className="size-4" />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </Cell>
            );
          })}
        </Ruled>
      )}
    </>
  );
}
