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
      <div className="flex flex-col gap-3 px-4 pt-4 pb-2">
        <nav aria-label="Categorías" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setActive(c.id);
                setQuery('');
              }}
              aria-pressed={!q && active === c.id}
              className="pressable flex h-11 shrink-0 items-center gap-2 rounded-full bg-sheet px-4 text-[15px] font-semibold text-ink-2 shadow-[var(--shadow-card)] hover:text-ink aria-pressed:bg-tint aria-pressed:text-on-tint aria-pressed:shadow-none"
            >
              <CategoryIcon icon={c.icon} />
              {c.name}
            </button>
          ))}
        </nav>
        <label className="sr-only" htmlFor="product-search">Buscar producto</label>
        <input id="product-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en toda la carta" className="h-11 rounded-full px-4 text-[16px] bg-fill outline-none focus:ring-[3px] focus:ring-tint/45" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
        {categories.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-3">La carta está vacía. Un encargado la monta en Carta.</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-3">{q ? 'Ningún producto coincide.' : 'Sin productos en esta categoría.'}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((p) => {
              const out = p.trackStock && !p.hasRecipe && Number(p.onHand ?? 0) <= 0;
              return (
                <li key={p.itemId}>
                  <button
                    type="button"
                    onClick={() => onPick(p)}
                    className="pressable flex h-28 w-full flex-col justify-between rounded-[18px] bg-sheet p-3.5 text-left shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-raised)] active:bg-fill"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-[16px] leading-snug font-semibold">{p.name}</span>
                      <span className="shrink-0 text-ink-3"><CategoryIcon icon={icon.get(p.categoryId) ?? 'utensils'} /></span>
                    </span>
                    <span className="flex items-end justify-between gap-2">
                      {out ? (
                        <span className={`text-xs font-semibold ${allowNegativeStock ? 'text-warning' : 'text-danger'}`}>Sin stock</span>
                      ) : (
                        <span />
                      )}
                      <span className="text-[19px] font-bold tracking-[-0.01em]">{formatEuro(p.pvp)}</span>
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
