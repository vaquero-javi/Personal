'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import type { Ingredient, RecipeDetail } from '@omnia/recipes/types';
import { foodCostPct, grossMargin } from '@omnia/recipes/types';
import { Button, Notice, useFlash } from '@/components/ui';
import { formatEuro, formatQty } from '@/lib/format';
import { saveRecipe } from '@/server/actions';
import { FoodCost } from './food-cost';

interface Row {
  key: string;
  ingredientId: string;
  quantity: string;
}

/**
 * Ficha técnica: ingredientes y cantidades por unidad vendida. El coste se
 * recalcula al momento con el coste medio de cada ingrediente en el almacén.
 */
export function RecipeEditor({ product, ingredients, warehouseName }: { product: RecipeDetail; ingredients: Ingredient[]; warehouseName: string }) {
  const router = useRouter();
  const [flash, show] = useFlash();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Row[]>(() =>
    product.lines.map((l) => ({ key: l.ingredientId, ingredientId: l.ingredientId, quantity: Number(l.quantity).toString().replace('.', ',') })),
  );
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const qty = (r: Row) => Number(r.quantity.replace(',', '.'));
  const cost = rows.reduce((s, r) => s + qty(r) * Number(byId.get(r.ingredientId)?.avgUnitCost ?? 0), 0);
  const live = { unitCost: rows.length ? cost.toFixed(4) : product.trackStock ? product.unitCost : null, netPrice: product.netPrice };
  const margin = grossMargin(live);
  const valid = rows.every((r) => r.ingredientId && /^\d+([.,]\d{1,4})?$/.test(r.quantity.trim()) && qty(r) > 0) && new Set(rows.map((r) => r.ingredientId)).size === rows.length;
  const noCost = rows.filter((r) => r.ingredientId && Number(byId.get(r.ingredientId)?.avgUnitCost ?? 0) === 0);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <Link href="/carta" aria-label="Volver a la carta" className="pressable flex size-11 items-center justify-center rounded-full bg-fill text-tint hover:bg-fill-strong">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div>
            <p className="text-[13px] font-medium text-ink-2">Escandallo · costes en {warehouseName}</p>
            <h1 className="text-[30px] leading-[1.1] font-bold tracking-[-0.022em]">{product.name}</h1>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['PVP', product.pvp ? formatEuro(product.pvp) : '—'],
            ['Sin IVA', product.netPrice ? formatEuro(product.netPrice) : '—'],
            ['Coste', live.unitCost === null ? '—' : formatEuro(live.unitCost)],
            ['Margen bruto', margin === null ? '—' : formatEuro(margin)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[16px] bg-sheet px-4 py-3 shadow-[var(--shadow-card)]">
              <dt className="text-[13px] font-medium text-ink-2">{label}</dt>
              <dd className="text-xl font-bold">{value}</dd>
            </div>
          ))}
          <div className="rounded-[16px] bg-sheet px-4 py-3 shadow-[var(--shadow-card)]">
            <dt className="text-[13px] font-medium text-ink-2">Food cost</dt>
            <dd className="text-xl"><FoodCost pct={foodCostPct(live)} /></dd>
          </div>
        </dl>

        {noCost.length > 0 && (
          <Notice tone="warning">
            {noCost.map((r) => byId.get(r.ingredientId)?.name).join(', ')} aún no {noCost.length === 1 ? 'tiene' : 'tienen'} coste: registra un albarán de compra en el backoffice para calcularlo.
          </Notice>
        )}

        <div className="overflow-x-auto rounded-[20px] bg-sheet shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line-soft text-[12px] text-ink-3">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Ingrediente</th>
                <th className="px-3 py-2 text-right font-semibold">Cantidad por unidad</th>
                <th className="px-3 py-2 text-right font-semibold">Coste medio</th>
                <th className="px-3 py-2 text-right font-semibold">Coste</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-3">
                    Sin ingredientes: {product.trackStock ? 'al venderlo se descuenta el propio artículo.' : 'al venderlo no se descuenta nada del almacén.'}
                  </td>
                </tr>
              )}
              {rows.map((r, i) => {
                const ing = byId.get(r.ingredientId);
                return (
                  <tr key={r.key}>
                    <td className="px-3 py-2">
                      <select
                        value={r.ingredientId}
                        onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, ingredientId: e.target.value } : x)))}
                        className="h-11 w-full rounded-[10px] px-2.5 bg-fill outline-none focus:ring-[3px] focus:ring-tint/45"
                        aria-label="Ingrediente"
                      >
                        <option value="">Elige un ingrediente…</option>
                        {ingredients.map((x) => (
                          <option key={x.id} value={x.id} disabled={x.id !== r.ingredientId && rows.some((o) => o.ingredientId === x.id)}>
                            {x.name} ({x.unit})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-2">
                        <input
                          value={r.quantity}
                          onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                          inputMode="decimal"
                          className="h-11 w-24 rounded-[10px] px-2.5 bg-fill outline-none focus:ring-[3px] focus:ring-tint/45 text-right"
                          aria-label={`Cantidad de ${ing?.name ?? 'ingrediente'}`}
                        />
                        <span className="w-8 text-left text-ink-3">{ing?.unit ?? ''}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-ink-2">{ing ? `${formatEuro(ing.avgUnitCost)}/${ing.unit}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold">{ing ? formatEuro(qty(r) * Number(ing.avgUnitCost) || 0) : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Quitar ingrediente" className="flex size-10 items-center justify-center rounded-md text-danger hover:bg-danger-soft">
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setRows([...rows, { key: crypto.randomUUID(), ingredientId: '', quantity: '' }])}>
            <Plus className="size-4" aria-hidden /> Añadir ingrediente
          </Button>
          <Button
            variant="primary"
            className="ml-auto"
            size="lg"
            disabled={!valid || pending}
            onClick={() =>
              start(async () => {
                const r = await saveRecipe(product.id, rows.map((x) => ({ ingredientId: x.ingredientId, quantity: x.quantity.trim().replace(',', '.') })));
                if (!r.ok) return show(r.error, 'danger');
                show(r.message ?? 'Guardado');
                router.refresh();
              })
            }
          >
            Guardar escandallo
          </Button>
        </div>
        <p className="text-sm text-ink-3">
          Cantidades en la unidad de cada ingrediente: 0,05 l son 5 cl; 0,2 kg son 200 g. Al cobrar, se descuentan del almacén {warehouseName} multiplicadas por las unidades vendidas. Vendidos en 30 días: {formatQty(product.soldLast30)}.
        </p>
      </div>
      {flash}
    </div>
  );
}
