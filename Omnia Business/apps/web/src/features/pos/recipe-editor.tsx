'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import type { Ingredient, RecipeDetail } from '@omnia/recipes/types';
import { foodCostPct, grossMargin } from '@omnia/recipes/types';
import { Cell } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { Notice, flash, inputClass } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { formatEuro, formatQty } from '@/lib/format';
import type { ActionState } from '@/server/actions';
import { FoodCost } from './food-cost';

interface Row {
  key: string;
  ingredientId: string;
  quantity: string;
}

const QTY = /^\d+([.,]\d{1,4})?$/;

/**
 * Escandallo desde el backoffice (igual que en el TPV): ingredientes y
 * cantidades por unidad vendida, con el coste recalculado al momento.
 */
export function RecipeEditor({
  product,
  ingredients,
  warehouseName,
  save,
}: {
  product: RecipeDetail;
  ingredients: Ingredient[];
  warehouseName: string;
  save: (lines: { ingredientId: string; quantity: string }[]) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(() =>
    product.lines.map((l) => ({ key: l.ingredientId, ingredientId: l.ingredientId, quantity: Number(l.quantity).toString().replace('.', ',') })),
  );
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const qty = (r: Row) => Number(r.quantity.replace(',', '.'));
  const cost = rows.reduce((s, r) => s + qty(r) * Number(byId.get(r.ingredientId)?.avgUnitCost ?? 0), 0);
  const live = { unitCost: rows.length ? cost.toFixed(4) : product.trackStock ? product.unitCost : null, netPrice: product.netPrice };
  const margin = grossMargin(live);
  const valid = rows.every((r) => r.ingredientId && QTY.test(r.quantity.trim()) && qty(r) > 0) && new Set(rows.map((r) => r.ingredientId)).size === rows.length;
  const noCost = rows.filter((r) => r.ingredientId && Number(byId.get(r.ingredientId)?.avgUnitCost ?? 0) === 0);
  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ['PVP', product.pvp ? formatEuro(product.pvp) : '—'],
          ['Sin IVA', product.netPrice ? formatEuro(product.netPrice) : '—'],
          ['Coste', live.unitCost === null ? '—' : formatEuro(live.unitCost)],
          ['Margen bruto', margin === null ? '—' : formatEuro(margin)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-sheet px-4 py-3 shadow-[var(--shadow-card)]">
            <dt className="text-xs text-ink-3">{label}</dt>
            <dd className="text-xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
        <div className="rounded-xl bg-sheet px-4 py-3 shadow-[var(--shadow-card)]">
          <dt className="text-xs text-ink-3">Food cost</dt>
          <dd className="text-xl"><FoodCost pct={foodCostPct(live)} /></dd>
        </div>
      </dl>

      <Cell title={`Ingredientes · costes en ${warehouseName}`}>
        {error && <Notice tone="danger">{error}</Notice>}
        {noCost.length > 0 && (
          <Notice tone="warning">
            {noCost.map((r) => byId.get(r.ingredientId)?.name).join(', ')} aún no {noCost.length === 1 ? 'tiene' : 'tienen'} coste: registra un albarán de compra para calcularlo.
          </Notice>
        )}
        <Table minWidth={640}>
          <thead>
            <tr>
              <Th>Ingrediente</Th>
              <Th align="right">Cantidad por unidad</Th>
              <Th align="right">Coste medio</Th>
              <Th align="right">Coste</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <Tr>
                <Td className="py-6 text-center text-ink-3">
                  Sin ingredientes: {product.trackStock ? 'al venderlo se descuenta el propio artículo.' : 'al venderlo no se descuenta nada del almacén.'}
                </Td>
              </Tr>
            )}
            {rows.map((r, i) => {
              const ing = byId.get(r.ingredientId);
              return (
                <Tr key={r.key}>
                  <Td>
                    <select value={r.ingredientId} onChange={(e) => update(i, { ingredientId: e.target.value })} className={`${inputClass} min-w-56`} aria-label="Ingrediente">
                      <option value="">Elige un ingrediente…</option>
                      {ingredients.map((x) => (
                        <option key={x.id} value={x.id} disabled={x.id !== r.ingredientId && rows.some((o) => o.ingredientId === x.id)}>
                          {x.name} ({x.unit})
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td align="right">
                    <span className="inline-flex items-center gap-2">
                      <input
                        value={r.quantity}
                        onChange={(e) => update(i, { quantity: e.target.value })}
                        inputMode="decimal"
                        className={`${inputClass.replace('w-full', '')} w-24 text-right`}
                        aria-label={`Cantidad de ${ing?.name ?? 'ingrediente'}`}
                      />
                      <span className="w-8 text-left text-ink-3">{ing?.unit ?? ''}</span>
                    </span>
                  </Td>
                  <Td align="right" className="text-ink-2">{ing ? `${formatEuro(ing.avgUnitCost)}/${ing.unit}` : '—'}</Td>
                  <Td align="right" className="font-semibold">{ing ? formatEuro(qty(r) * Number(ing.avgUnitCost) || 0) : '—'}</Td>
                  <Td align="right">
                    <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Quitar ingrediente" className="inline-flex size-9 items-center justify-center rounded-full text-danger hover:bg-danger-soft">
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => setRows([...rows, { key: crypto.randomUUID(), ingredientId: '', quantity: '' }])}>
            <Plus className="size-4" aria-hidden /> Añadir ingrediente
          </Button>
          <Button
            variant="primary"
            className="ml-auto"
            disabled={!valid || pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await save(rows.map((x) => ({ ingredientId: x.ingredientId, quantity: x.quantity.trim().replace(',', '.') })));
                if (!r.ok) return setError(r.error ?? 'No se pudo guardar');
                flash(r.message ?? 'Guardado');
                router.refresh();
              })
            }
          >
            Guardar escandallo
          </Button>
        </div>
        <p className="mt-3 text-sm text-ink-3">
          Cantidades en la unidad de cada ingrediente: 0,05 l son 5 cl; 0,2 kg son 200 g. Al cobrar, se descuentan del almacén multiplicadas por las unidades vendidas. Vendidos en 30 días: {formatQty(product.soldLast30)}.
        </p>
      </Cell>
    </div>
  );
}
