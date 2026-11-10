'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CostedProduct } from '@omnia/recipes/types';
import { foodCostPct, grossMargin } from '@omnia/recipes/types';
import { Cell } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { Notice, flash, inputClass } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { formatEuro, formatQty } from '@/lib/format';
import type { ActionState } from '@/server/actions';
import { FoodCost } from './food-cost';

type SaveInput = { itemId: string; categoryId: string | null; pvp: string };
type CreateInput = { name: string; categoryId: string; pvp: string; taxRate: string; kind: 'stock' | 'recipe' };

const narrow = inputClass.replace('w-full', '');
const PRICE = /^\d+([.,]\d{1,2})?$/;
const toPrice = (p: string | null) => (p ? Number(p).toFixed(2).replace('.', ',') : '');

/**
 * Carta del TPV desde el backoffice: lo mismo que «Carta» en la tablet. Cada
 * cambio se guarda en la base de datos que lee el TPV, que lo recoge en unos
 * segundos sin recargar.
 */
export function MenuEditor({
  base,
  products,
  categories,
  candidates,
  save,
  create,
}: {
  /** Ruta de esta pantalla, para enlazar el escandallo de cada producto. */
  base: string;
  products: CostedProduct[];
  categories: { id: string; name: string }[];
  candidates: { id: string; name: string }[];
  save: (input: SaveInput) => Promise<ActionState>;
  create: (input: CreateInput) => Promise<ActionState & { id?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const act = (work: () => Promise<ActionState & { id?: string }>, done?: (r: ActionState & { id?: string }) => void) =>
    start(async () => {
      setError(null);
      const r = await work();
      if (!r.ok) return setError(r.error ?? 'No se pudo guardar');
      if (r.message) flash(r.message);
      done?.(r);
      router.refresh();
    });

  const shown = filter ? products.filter((p) => (p.categoryId ?? '') === (filter === 'fuera' ? '' : filter)) : products;

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <Cell title="Nuevo producto">
        <NewProductForm
          categories={categories}
          candidates={candidates}
          busy={pending}
          onCreate={(input, reset) =>
            act(
              () => create(input),
              (r) => {
                reset();
                if (input.kind === 'recipe' && r.id) router.push(`${base}/${r.id}`);
              },
            )
          }
          onPlace={(input, reset) => act(() => save(input), reset)}
        />
      </Cell>
      <Cell
        title="Productos y precios"
        actions={
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${narrow} w-auto`} aria-label="Filtrar por categoría">
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="fuera">Fuera de carta</option>
          </select>
        }
      >
        {error && <Notice tone="danger">{error}</Notice>}
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">No hay productos con este filtro.</p>
        ) : (
          <Table minWidth={900}>
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th>Categoría</Th>
                <Th align="right">PVP</Th>
                <Th align="right">Coste</Th>
                <Th align="right">Food cost</Th>
                <Th align="right">Margen</Th>
                <Th align="right">Vendidos 30 d</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                // La clave incluye precio y categoría: si cambian (aquí o desde el TPV), la fila se rehace con los datos nuevos.
                <ProductRow key={`${p.id}-${p.pvp}-${p.categoryId}`} p={p} base={base} categories={categories} disabled={pending} onSave={(input) => act(() => save(input))} />
              ))}
            </tbody>
          </Table>
        )}
      </Cell>

    </div>
  );
}

function ProductRow({ p, base, categories, disabled, onSave }: {
  p: CostedProduct;
  base: string;
  categories: { id: string; name: string }[];
  disabled: boolean;
  onSave: (input: SaveInput) => void;
}) {
  const [category, setCategory] = useState(p.categoryId ?? '');
  const [pvp, setPvp] = useState(toPrice(p.pvp));
  const dirty = category !== (p.categoryId ?? '') || pvp.replace(',', '.') !== (p.pvp ? Number(p.pvp).toFixed(2) : '');
  const margin = grossMargin(p);
  const valid = PRICE.test(pvp.trim());
  return (
    <Tr>
      <Td>
        <span className="font-medium">{p.name}</span>
        <span className="block text-xs text-ink-3">{p.hasRecipe ? 'Con escandallo' : p.trackStock ? 'Se descuenta como unidad' : 'Sin escandallo: no descuenta stock'}</span>
      </Td>
      <Td>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputClass} min-w-36`} aria-label={`Categoría de ${p.name}`}>
          <option value="">Fuera de carta</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Td>
      <Td align="right">
        <input
          value={pvp}
          onChange={(e) => setPvp(e.target.value)}
          inputMode="decimal"
          aria-label={`PVP de ${p.name}`}
          aria-invalid={!valid && pvp !== '' ? true : undefined}
          className={`${narrow} w-24 text-right`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty && valid) onSave({ itemId: p.id, categoryId: category || null, pvp: pvp.trim().replace(',', '.') });
          }}
        />
      </Td>
      <Td align="right" className="text-ink-2">{p.unitCost === null ? '—' : formatEuro(p.unitCost)}</Td>
      <Td align="right"><FoodCost pct={foodCostPct(p)} /></Td>
      <Td align="right">{margin === null ? '—' : formatEuro(margin)}</Td>
      <Td align="right" className="text-ink-2">{formatQty(p.soldLast30)}</Td>
      <Td align="right">
        <div className="flex justify-end gap-2">
          <Link href={`${base}/${p.id}`} className="pressable inline-flex h-9 items-center rounded-full bg-fill px-3.5 text-[14px] font-semibold text-tint hover:bg-fill-strong">
            Escandallo
          </Link>
          <Button variant="primary" disabled={!dirty || disabled || !valid} onClick={() => onSave({ itemId: p.id, categoryId: category || null, pvp: pvp.trim().replace(',', '.') })}>
            Guardar
          </Button>
        </div>
      </Td>
    </Tr>
  );
}

function NewProductForm({ categories, candidates, busy, onCreate, onPlace }: {
  categories: { id: string; name: string }[];
  candidates: { id: string; name: string }[];
  busy: boolean;
  onCreate: (input: CreateInput, reset: () => void) => void;
  onPlace: (input: SaveInput, reset: () => void) => void;
}) {
  const [mode, setMode] = useState<'recipe' | 'stock' | 'existing'>('recipe');
  const [name, setName] = useState('');
  const [itemId, setItemId] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [pvp, setPvp] = useState('');
  const [tax, setTax] = useState('10');
  const validPrice = PRICE.test(pvp.trim());
  const reset = () => {
    setName('');
    setItemId('');
    setPvp('');
  };
  const label = 'flex flex-col gap-1 text-[13px] font-medium text-ink-2';

  if (categories.length === 0) {
    return <p className="text-sm text-ink-2">Crea antes una categoría de la carta (arriba, en «Añadir categoría»).</p>;
  }

  return (
    <form
      className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_8rem_minmax(0,11rem)_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        const price = pvp.trim().replace(',', '.');
        if (mode === 'existing') onPlace({ itemId, categoryId, pvp: price }, reset);
        else onCreate({ name: name.trim(), categoryId, pvp: price, taxRate: tax, kind: mode }, reset);
      }}
    >
      <div className="grid max-w-xl grid-cols-3 gap-1.5 md:col-span-2 xl:col-span-5" role="radiogroup" aria-label="Tipo de producto">
        {([
          ['recipe', 'Elaborado', 'Cóctel, plato…'],
          ['stock', 'De unidad', 'Botellín, refresco'],
          ['existing', 'Del almacén', 'Ya existe'],
        ] as const).map(([value, title, hint]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className="pressable rounded-[10px] bg-fill px-2 py-2 text-left aria-checked:bg-tint aria-checked:text-on-tint"
          >
            <span className="block text-[13px] font-semibold">{title}</span>
            <span className="block text-[11px] opacity-80">{hint}</span>
          </button>
        ))}
      </div>
      {mode === 'existing' ? (
        <label className={label}>
          Artículo del almacén
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={inputClass} required>
            <option value="">Elige…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className={label}>
          Nombre
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputClass} required />
        </label>
      )}
      <label className={label}>
        Categoría
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass} required>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        PVP con IVA (€)
        <input value={pvp} onChange={(e) => setPvp(e.target.value)} inputMode="decimal" placeholder="0,00" className={`${inputClass} text-right`} required />
      </label>
      {mode !== 'existing' && (
        <label className={label}>
          IVA
          <select value={tax} onChange={(e) => setTax(e.target.value)} className={inputClass}>
            <option value="10">10 % · hostelería</option>
            <option value="21">21 % · general</option>
            <option value="4">4 % · superreducido</option>
          </select>
        </label>
      )}
      {mode === 'existing' && <span className="hidden xl:block" aria-hidden />}
      <Button type="submit" variant="primary" disabled={busy || !validPrice || !categoryId || (mode === 'existing' ? !itemId : !name.trim())}>
        {mode === 'recipe' ? 'Crear y montar escandallo' : 'Añadir a la carta'}
      </Button>
      <p className="text-xs text-ink-3 md:col-span-2 xl:col-span-5">Aparece en el TPV en unos segundos, sin recargar.{mode === 'recipe' ? ' Después de crearlo te llevamos a su escandallo.' : ''}</p>
    </form>
  );
}
