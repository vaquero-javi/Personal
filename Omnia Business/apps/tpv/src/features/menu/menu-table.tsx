'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { CostedProduct } from '@omnia/recipes/types';
import { foodCostPct, grossMargin } from '@omnia/recipes/types';
import { Button, Modal, useFlash } from '@/components/ui';
import { formatEuro, formatQty } from '@/lib/format';
import { createMenuItem, saveMenuItem } from '@/server/actions';
import { FoodCost } from './food-cost';
import { useAutoRefresh } from '../use-auto-refresh';

const cell = 'h-10 rounded-[10px] px-2.5 bg-fill outline-none focus:ring-[3px] focus:ring-tint/45';

export function MenuTable({ products, categories, candidates }: {
  products: CostedProduct[];
  categories: { id: string; name: string }[];
  candidates: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [flash, show] = useFlash();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  // Recoge los cambios hechos desde el backoffice sin recargar (no mientras se crea un producto).
  useAutoRefresh(10_000, !creating && !pending);

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
            <h1 className="text-[30px] leading-[1.1] font-bold tracking-[-0.022em]">Carta y escandallos</h1>
            <p className="text-sm text-ink-3">Coste según el coste medio de los ingredientes en este almacén. Food cost sobre el precio sin IVA.</p>
          </div>
          <Button variant="primary" className="ml-auto" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> Nuevo producto
          </Button>
        </div>
        <div className="overflow-x-auto rounded-[20px] bg-sheet shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="border-b border-line-soft text-[12px] text-ink-3">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Producto</th>
                <th className="px-3 py-2 text-left font-semibold">Categoría</th>
                <th className="px-3 py-2 text-right font-semibold">PVP</th>
                <th className="px-3 py-2 text-right font-semibold">Coste</th>
                <th className="px-3 py-2 text-right font-semibold">Food cost</th>
                <th className="px-3 py-2 text-right font-semibold">Margen</th>
                <th className="px-3 py-2 text-right font-semibold">Vendidos 30 d</th>
                <th className="px-3 py-2 text-right font-semibold">Beneficio 30 d</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {products.map((p) => (
                // Clave con precio y categoría: si cambian (aquí o desde el backoffice), la fila se rehace con los datos nuevos.
                <ProductRow key={`${p.id}-${p.pvp}-${p.categoryId}`} p={p} categories={categories} disabled={pending} onSave={(input) => act(() => saveMenuItem(input))} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <NewProductDialog
        open={creating}
        onClose={() => setCreating(false)}
        categories={categories}
        candidates={candidates}
        busy={pending}
        onCreate={(input) =>
          act(
            async () => {
              const r = await createMenuItem(input);
              if (r.ok && input.kind === 'recipe') router.push(`/carta/${r.data}`);
              return r;
            },
            () => setCreating(false),
          )
        }
        onPlace={(input) => act(() => saveMenuItem(input), () => setCreating(false))}
      />
      {flash}
    </div>
  );
}

function ProductRow({ p, categories, disabled, onSave }: {
  p: CostedProduct;
  categories: { id: string; name: string }[];
  disabled: boolean;
  onSave: (input: { itemId: string; categoryId: string | null; pvp: string }) => void;
}) {
  const [category, setCategory] = useState(p.categoryId ?? '');
  const [pvp, setPvp] = useState(p.pvp ? Number(p.pvp).toFixed(2).replace('.', ',') : '');
  const dirty = category !== (p.categoryId ?? '') || pvp.replace(',', '.') !== (p.pvp ? Number(p.pvp).toFixed(2) : '');
  const margin = grossMargin(p);
  const sold = Number(p.soldLast30);
  return (
    <tr>
      <td className="px-3 py-2">
        <span className="font-semibold">{p.name}</span>
        <span className="block text-xs text-ink-3">{p.hasRecipe ? 'Con escandallo' : p.trackStock ? 'Se descuenta como unidad' : 'Sin escandallo: no descuenta stock'}</span>
      </td>
      <td className="px-3 py-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={cell} aria-label={`Categoría de ${p.name}`}>
          <option value="">Fuera de carta</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-right">
        <input value={pvp} onChange={(e) => setPvp(e.target.value)} inputMode="decimal" className={`${cell} w-24 text-right`} aria-label={`PVP de ${p.name}`} />
      </td>
      <td className="px-3 py-2 text-right">{p.unitCost === null ? '—' : formatEuro(p.unitCost)}</td>
      <td className="px-3 py-2 text-right"><FoodCost pct={foodCostPct(p)} /></td>
      <td className="px-3 py-2 text-right">{margin === null ? '—' : formatEuro(margin)}</td>
      <td className="px-3 py-2 text-right">{formatQty(sold)}</td>
      <td className="px-3 py-2 text-right">{margin === null ? '—' : formatEuro(margin * sold)}</td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-2">
          <Link href={`/carta/${p.id}`} className="pressable inline-flex h-10 items-center rounded-full bg-fill px-4 font-semibold text-tint hover:bg-fill-strong">Escandallo</Link>
          <Button size="sm" variant="primary" className="h-10" disabled={!dirty || disabled || !/^\d+([.,]\d{1,2})?$/.test(pvp.trim())} onClick={() => onSave({ itemId: p.id, categoryId: category || null, pvp: pvp.trim().replace(',', '.') })}>
            Guardar
          </Button>
        </div>
      </td>
    </tr>
  );
}

function NewProductDialog({ open, onClose, categories, candidates, busy, onCreate, onPlace }: {
  open: boolean;
  onClose: () => void;
  categories: { id: string; name: string }[];
  candidates: { id: string; name: string }[];
  busy: boolean;
  onCreate: (input: { name: string; categoryId: string; pvp: string; taxRate: string; kind: 'stock' | 'recipe'; unit?: string }) => void;
  onPlace: (input: { itemId: string; categoryId: string; pvp: string }) => void;
}) {
  const [mode, setMode] = useState<'recipe' | 'stock' | 'existing'>('recipe');
  const [name, setName] = useState('');
  const [itemId, setItemId] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [pvp, setPvp] = useState('');
  const [tax, setTax] = useState('10');
  const field = 'flex flex-col gap-1.5 text-[13px] font-medium text-ink-2';
  const input = 'h-11 rounded-[12px] px-3.5 bg-fill outline-none focus:ring-[3px] focus:ring-tint/45 text-base font-normal text-ink';
  const validPrice = /^\d+([.,]\d{1,2})?$/.test(pvp.trim());
  return (
    <Modal open={open} onClose={onClose} title="Nuevo producto en la carta">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const price = pvp.trim().replace(',', '.');
          if (mode === 'existing') onPlace({ itemId, categoryId, pvp: price });
          else onCreate({ name: name.trim(), categoryId, pvp: price, taxRate: tax, kind: mode });
        }}
      >
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de producto">
          {([
            ['recipe', 'Elaborado', 'Cóctel, plato… con escandallo'],
            ['stock', 'De unidad', 'Botellín, refresco nuevo'],
            ['existing', 'Del almacén', 'Un artículo que ya existe'],
          ] as const).map(([value, label, hint]) => (
            <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)} className="pressable rounded-[12px] bg-fill p-2.5 text-left aria-checked:bg-tint aria-checked:text-white">
              <span className="block text-sm font-semibold">{label}</span>
              <span className="block text-xs opacity-80">{hint}</span>
            </button>
          ))}
        </div>
        {mode === 'existing' ? (
          <label className={field}>
            Artículo
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={input} required>
              <option value="">Elige…</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        ) : (
          <label className={field}>
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={input} required />
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className={field}>
            Categoría
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={input} required>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className={field}>
            PVP con IVA (€)
            <input value={pvp} onChange={(e) => setPvp(e.target.value)} inputMode="decimal" className={`${input} text-right`} required />
          </label>
        </div>
        {mode !== 'existing' && (
          <label className={field}>
            IVA
            <select value={tax} onChange={(e) => setTax(e.target.value)} className={input}>
              <option value="10">10 % · hostelería (comida y bebida servida)</option>
              <option value="21">21 % · general</option>
              <option value="4">4 % · superreducido</option>
            </select>
          </label>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={busy || !validPrice || !categoryId || (mode === 'existing' ? !itemId : !name.trim())}>
          {mode === 'recipe' ? 'Crear y montar el escandallo' : 'Añadir a la carta'}
        </Button>
      </form>
    </Modal>
  );
}
