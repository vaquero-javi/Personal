'use client';

import { useMemo, useState } from 'react';
import type { MenuProduct, PosCategory } from '@omnia/pos/types';
import { CategoryIcon } from '@/components/category-icon';
import { formatEuro } from '@/lib/format';

export function ProductPicker({ categories, products, onPick, allowNegativeStock }: {
  categories: PosCategory[];
  products: MenuProduct[];
  onPick: (p: MenuProduct) => void;
  allowNegativeStock: boolean;
}) {
  const [active, setActive] = useState(categories[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const icon = useMemo(() => new Map(categories.map((c) => [c.id, c.icon])), [categories]);
  const q = query.trim().toLowerCase();
  const shown = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products.filter((p) => p.categoryId === active);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-shelf-edge bg-sheet p-3">
        <nav aria-label="Categorías" className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setActive(c.id);
                setQuery('');
              }}
              aria-pressed={!q && active === c.id}
              className="flex h-12 shrink-0 items-center gap-2 rounded-lg border border-shelf-edge px-4 text-sm font-semibold aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white"
            >
              <CategoryIcon icon={c.icon} />
              {c.name}
            </button>
          ))}
        </nav>
        <label className="sr-only" htmlFor="product-search">Buscar producto</label>
        <input id="product-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en toda la carta" className="h-11 rounded-lg border border-shelf-edge bg-sheet px-3" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {categories.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-3">La carta está vacía. Un encargado la monta en Carta.</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-3">{q ? 'Ningún producto coincide.' : 'Sin productos en esta categoría.'}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((p) => {
              const out = p.trackStock && !p.hasRecipe && Number(p.onHand ?? 0) <= 0;
              return (
                <li key={p.itemId}>
                  <button
                    type="button"
                    onClick={() => onPick(p)}
                    className="flex h-28 w-full flex-col justify-between rounded-xl border border-shelf-edge bg-sheet p-3 text-left transition-colors hover:border-ink active:bg-sheet-head"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 font-semibold leading-snug">{p.name}</span>
                      <span className="shrink-0 text-ink-3"><CategoryIcon icon={icon.get(p.categoryId) ?? 'utensils'} /></span>
                    </span>
                    <span className="flex items-end justify-between gap-2">
                      {out ? (
                        <span className={`text-xs font-semibold ${allowNegativeStock ? 'text-warning' : 'text-danger'}`}>Sin stock</span>
                      ) : (
                        <span />
                      )}
                      <span className="text-lg font-bold">{formatEuro(p.pvp)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
