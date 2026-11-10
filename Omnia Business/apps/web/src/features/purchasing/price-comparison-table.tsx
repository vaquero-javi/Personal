import Link from 'next/link';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Sparkles } from 'lucide-react';
import type { PriceComparison, PriceComparisonRow, PriceTrend } from '@omnia/purchasing/types';
import { Badge } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { formatDate, formatEuro, formatUnitPrice } from '@/lib/format';
import type { Tone } from '@/lib/labels';

export const trendLabel: Record<PriceTrend, readonly [string, Tone, typeof ArrowRight]> = {
  up: ['Sube', 'danger', ArrowUpRight],
  down: ['Baja', 'ok', ArrowDownRight],
  same: ['Igual', 'neutral', ArrowRight],
  new: ['Nuevo', 'info', Sparkles],
};

const ORDER: Record<PriceTrend, number> = { up: 0, down: 1, new: 2, same: 3 };
/** Primero lo que más sube, luego lo que más baja, los nuevos y por último lo que no cambia. */
export const sortRows = (rows: readonly PriceComparisonRow[]) =>
  [...rows].sort((a, b) => ORDER[a.trend] - ORDER[b.trend] || Math.abs(b.diffPct ?? 0) - Math.abs(a.diffPct ?? 0));

const signed = (n: number, text: string) => (n > 0 ? `+${text}` : text.replace('-', '−'));

export function TrendBadge({ trend }: { trend: PriceTrend }) {
  const [label, tone, Icon] = trendLabel[trend];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden className="mr-1 size-3.5" />
      {label}
    </Badge>
  );
}

/** Resumen: cuántos artículos suben, bajan, se mantienen o son nuevos, y el efecto en euros. */
export function ComparisonSummary({ comparison }: { comparison: PriceComparison }) {
  const impact = Number(comparison.impact);
  const tiles: [PriceTrend, string][] = [
    ['up', 'Suben de precio'],
    ['down', 'Bajan de precio'],
    ['same', 'Mismo precio'],
    ['new', 'Nuevos'],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {tiles.map(([trend, label]) => {
        const [, tone] = trendLabel[trend];
        const n = comparison.counts[trend];
        return (
          <div key={trend} className="rounded-xl bg-fill/70 px-3.5 py-3">
            <p className="text-xs text-ink-3">{label}</p>
            <p className={`text-2xl font-bold tabular-nums ${n && tone === 'danger' ? 'text-danger' : n && tone === 'ok' ? 'text-ok' : 'text-ink'}`}>{n}</p>
          </div>
        );
      })}
      {comparison.previous && (
        <div className="col-span-2 rounded-xl bg-fill/70 px-3.5 py-3 md:col-span-1">
          <p className="text-xs text-ink-3" title="(precio nuevo − anterior) × cantidad de la última factura">Efecto en la factura</p>
          <p className={`text-2xl font-bold tabular-nums ${impact > 0 ? 'text-danger' : impact < 0 ? 'text-ok' : 'text-ink'}`}>{signed(impact, formatEuro(impact))}</p>
        </div>
      )}
    </div>
  );
}

/** «Comparado con la factura X del dd/mm/aaaa». */
export function PreviousInvoiceLine({ comparison, href }: { comparison: PriceComparison; href: (id: string) => string }) {
  if (!comparison.previous) {
    return <p className="text-sm text-ink-2">Es la primera factura registrada de este proveedor: no hay precios anteriores con qué comparar, todos los artículos salen como nuevos.</p>;
  }
  return (
    <p className="text-sm text-ink-2">
      Precio por unidad comparado con la última factura del proveedor,{' '}
      <Link href={href(comparison.previous.id)} className="font-semibold text-ink underline-offset-2 hover:underline">
        {comparison.previous.fullNumber}
      </Link>{' '}
      del {formatDate(comparison.previous.issueDate)}. Se compara el precio de una unidad (con su descuento), no el importe de la línea, así que da igual cuántas se compraran.
    </p>
  );
}

export function ComparisonTable({ rows, labels }: { rows: readonly PriceComparisonRow[]; labels?: { previous: string; current: string } }) {
  return (
    <Table minWidth={640}>
      <thead>
        <tr>
          <Th>Artículo</Th>
          <Th align="right">{labels?.previous ?? 'Precio anterior'}</Th>
          <Th align="right">{labels?.current ?? 'Precio nuevo'}</Th>
          <Th align="right">Diferencia / ud.</Th>
          <Th>Estado</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <Tr key={`${r.description}-${i}`}>
            <Td>
              <span className="block">{r.description}</span>
              {r.previousDescription && <span className="block text-xs text-ink-3">Antes: «{r.previousDescription}»</span>}
            </Td>
            <Td align="right" className="text-ink-2">{r.previousPrice === null ? '—' : formatUnitPrice(r.previousPrice)}</Td>
            <Td align="right" className="font-semibold">{formatUnitPrice(r.price)}</Td>
            <Td align="right" className={r.trend === 'up' ? 'text-danger' : r.trend === 'down' ? 'text-ok' : 'text-ink-3'}>
              {r.diff === null || r.trend === 'same' ? (
                '—'
              ) : (
                <>
                  {signed(Number(r.diff), formatUnitPrice(r.diff))}
                  {r.diffPct !== null && <span className="block text-xs">{signed(r.diffPct, `${r.diffPct.toLocaleString('es-ES')} %`)}</span>}
                </>
              )}
            </Td>
            <Td><TrendBadge trend={r.trend} /></Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

export function MissingItems({ items }: { items: PriceComparison['missing'] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4 border-t border-line-soft pt-3 text-sm">
      <p className="font-semibold text-ink">Venían en la factura anterior y no en esta ({items.length})</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-ink-2">
        {items.map((m, i) => (
          <li key={`${m.description}-${i}`}>
            {m.description} · <span className="text-ink-3">{formatUnitPrice(m.price)} / ud.</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
