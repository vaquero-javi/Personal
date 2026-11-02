'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Ingredient } from '@omnia/recipes/types';
import { Button, Modal, Notice, useFlash } from '@/components/ui';
import { formatEuro, formatQty } from '@/lib/format';
import { recount, setMinimum } from '@/server/actions';

export function StockTable({ ingredients, warehouseName, allowNegative }: { ingredients: Ingredient[]; warehouseName: string; allowNegative: boolean }) {
  const router = useRouter();
  const [flash, show] = useFlash();
  const [pending, start] = useTransition();
  const [counting, setCounting] = useState<Ingredient | null>(null);
  const [counted, setCounted] = useState('');
  const [packs, setPacks] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const low = (i: Ingredient) => Number(i.onHand) < 0 || (Number(i.minQuantity) > 0 && Number(i.onHand) <= Number(i.minQuantity));
  const shown = onlyLow ? ingredients.filter(low) : ingredients;
  const value = ingredients.reduce((s, i) => s + Math.max(0, Number(i.onHand)) * Number(i.avgUnitCost), 0);

  const act = (work: () => Promise<{ ok: boolean; error?: string; message?: string }>, done?: () => void) =>
    start(async () => {
      const r = await work();
      if (!r.ok) return show(r.error ?? 'No se pudo guardar', 'danger');
      if (r.message) show(r.message);
      done?.();
      router.refresh();
    });

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h1 className="text-lg font-bold">Materia prima · {warehouseName}</h1>
            <p className="text-sm text-ink-3">
              {ingredients.filter(low).length} bajo mínimo · valor del stock {formatEuro(value)}. Las entradas se registran con albaranes en el backoffice.
            </p>
          </div>
          <label className="ml-auto flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="size-5 accent-ink" />
            Solo bajo mínimo
          </label>
        </div>
        {allowNegative && <Notice>Esta empresa permite stock negativo: se puede vender aunque el inventario diga que no queda. Recuenta para corregirlo.</Notice>}
        <div className="overflow-x-auto rounded-xl border border-shelf-edge bg-sheet">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-sheet-head text-xs text-ink-3">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Ingrediente</th>
                <th className="px-3 py-2 text-right font-semibold">Stock</th>
                <th className="px-3 py-2 text-right font-semibold">Mínimo</th>
                <th className="px-3 py-2 text-right font-semibold">Coste medio</th>
                <th className="px-3 py-2 text-right font-semibold">Valor</th>
                <th className="px-3 py-2 text-right font-semibold">En escandallos</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {shown.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2">
                    <span className="font-semibold">{i.name}</span>
                    <span className="block text-xs text-ink-3">{i.sku}</span>
                  </td>
                  <td className={`px-3 py-2 text-right font-bold ${low(i) ? 'text-danger' : ''}`}>
                    {formatQty(i.onHand)} {i.unit}
                    {i.purchaseUnit && (
                      <span className="block text-xs font-normal text-ink-3">
                        {formatQty((Number(i.onHand) / Number(i.purchasePackSize)).toFixed(1))} {i.purchaseUnit} de {formatQty(i.purchasePackSize)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MinimumField item={i} disabled={pending} onSave={(min) => act(() => setMinimum(i.id, min))} />
                  </td>
                  <td className="px-3 py-2 text-right">{formatEuro(i.avgUnitCost)}/{i.unit}</td>
                  <td className="px-3 py-2 text-right">{formatEuro(Math.max(0, Number(i.onHand)) * Number(i.avgUnitCost))}</td>
                  <td className="px-3 py-2 text-right">{i.usedIn}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" className="h-10" onClick={() => { setCounting(i); setCounted(''); setPacks(''); }}>Recontar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={counting !== null} onClose={() => setCounting(null)} title={`Recontar ${counting?.name ?? ''}`}>
        {counting && (() => {
          const n = (t: string) => (t.trim() === '' ? 0 : Number(t.trim().replace(',', '.')));
          const okNum = (t: string) => t.trim() === '' || /^\d+([.,]\d{1,4})?$/.test(t.trim());
          const pack = counting.purchaseUnit ? Number(counting.purchasePackSize) : 0;
          // Cajas llenas × unidades por caja + lo suelto, en la unidad de stock.
          const total = Number((n(packs) * pack + n(counted)).toFixed(4));
          const ready = okNum(packs) && okNum(counted) && (packs.trim() !== '' || counted.trim() !== '');
          return (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                act(async () => {
                  const r = await recount(counting.id, String(total));
                  return r.ok ? { ok: true, message: Number(r.data) === 0 ? 'Cuadra con el stock teórico' : `Ajuste de ${formatQty(r.data)} ${counting.unit} registrado` } : r;
                }, () => setCounting(null));
              }}
            >
              <p className="text-sm text-ink-2">Stock teórico: <b>{formatQty(counting.onHand)} {counting.unit}</b>. Se registra un ajuste por la diferencia.</p>
              <div className={`grid gap-3 ${pack ? 'grid-cols-2' : ''}`}>
                {pack > 0 && (
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-3">
                    {counting.purchaseUnit} llenas (de {formatQty(pack)})
                    <input value={packs} onChange={(e) => setPacks(e.target.value)} inputMode="decimal" autoFocus className="h-12 rounded-lg border border-shelf-edge px-3 text-right text-lg font-semibold text-ink" />
                  </label>
                )}
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-3">
                  {pack ? `${counting.unit} sueltas` : `Cantidad contada (${counting.unit})`}
                  <input value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="decimal" autoFocus={!pack} className="h-12 rounded-lg border border-shelf-edge px-3 text-right text-lg font-semibold text-ink" />
                </label>
              </div>
              {pack > 0 && ready && <p className="text-right text-sm font-semibold text-ok">Total: {formatQty(total)} {counting.unit}</p>}
              <Button type="submit" variant="primary" size="lg" disabled={pending || !ready}>Registrar recuento</Button>
            </form>
          );
        })()}
      </Modal>
      {flash}
    </div>
  );
}

function MinimumField({ item, disabled, onSave }: { item: Ingredient; disabled: boolean; onSave: (min: string) => void }) {
  const [value, setValue] = useState(Number(item.minQuantity).toString().replace('.', ','));
  if (!item.hasStockRow) return <span className="text-xs text-ink-3" title="Se puede fijar tras la primera entrada">—</span>;
  const dirty = value.replace(',', '.') !== Number(item.minQuantity).toString();
  return (
    <span className="inline-flex items-center gap-1">
      <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className="h-10 w-20 rounded-md border border-shelf-edge px-2 text-right" aria-label={`Mínimo de ${item.name}`} />
      {dirty && (
        <Button size="sm" variant="primary" className="h-10" disabled={disabled || !/^\d+([.,]\d{1,4})?$/.test(value.trim())} onClick={() => onSave(value.trim().replace(',', '.'))}>
          OK
        </Button>
      )}
    </span>
  );
}
