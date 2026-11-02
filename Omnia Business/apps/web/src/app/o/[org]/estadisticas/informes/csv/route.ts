import { parseYear } from '@/features/stats/period';
import { buildReport, REPORT_COLUMNS } from '@/features/stats/report';
import { todayIso } from '@/lib/format';
import { container } from '@/server/container';
import { requirePermission } from '@/server/session';

/** Informe de gestión en CSV (separador «;» y coma decimal, como lo abre Excel en español). */
export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const url = new URL(request.url);
  const year = parseYear(url.searchParams.get('anio') ?? undefined);
  const groupBy = url.searchParams.get('agrupar') === 'trimestre' ? 'trimestre' : 'mes';
  const { ctx } = await requirePermission(org, 'stats.read');
  const today = todayIso();
  const months = (await container().stats.monthly(ctx, `${year}-01-01`, `${year}-12-01`)).filter((m) => year < Number(today.slice(0, 4)) || m.month <= today);
  const { rows, total } = buildReport(months, groupBy);
  const cell = (v: string | number) => {
    const text = typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v;
    return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [
    [groupBy === 'mes' ? 'Mes' : 'Trimestre', ...REPORT_COLUMNS.map((c) => c.label)].map(cell).join(';'),
    ...[...rows, total].map((r) => [r.label, ...REPORT_COLUMNS.map((c) => (c.money ? r[c.key] : String(r[c.key])))].map(cell).join(';')),
  ];
  return new Response(`﻿${lines.join('\r\n')}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="informe-gestion-${org}-${year}-${groupBy}.csv"`,
    },
  });
}
