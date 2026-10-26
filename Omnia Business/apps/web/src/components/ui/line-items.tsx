'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from './button';
import { inputClass, useFieldErrors } from './form';
import { formatEuro } from '@/lib/format';

export interface ItemOption {
  id: string;
  sku: string;
  name: string;
  unit: string;
  /** Precio de venta sugerido (tarifa) o coste sugerido (compras). */
  suggested?: string;
  taxRate: string;
}

type Mode = 'cost' | 'price';

export interface LineDraft {
  itemId: string;
  description: string;
  quantity: string;
  unit: string; // unitCost (cost) o unitPrice (price)
  discountPct: string;
  taxRate: string;
  /** Texto leído de un documento escaneado, para cotejar la línea. */
  read?: string;
  match?: 'exact' | 'probable' | 'none';
}

interface Line extends LineDraft {
  key: number;
  /** Artículo propuesto por el escaneo (para saber si ya se ha corregido). */
  readItemId?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (s: string) => Number(s.replace(',', '.')) || 0;

/**
 * Editor de líneas. `cost`: artículo, cantidad y coste (albaranes y pedidos a
 * proveedor). `price`: artículo o concepto libre, cantidad, precio, descuento e
 * IVA (facturas y pedidos de venta). Envía `lines` como JSON; el servidor
 * valida y recalcula, los totales de aquí son solo orientativos.
 */
export function LineItems({
  items,
  mode,
  allowFreeText = false,
  initial = [],
  name = 'lines',
  showTotals = true,
  onChange,
}: {
  items: ItemOption[];
  mode: Mode;
  allowFreeText?: boolean;
  initial?: LineDraft[];
  name?: string;
  /** false cuando la pantalla pinta sus propios totales (p. ej. con retención). */
  showTotals?: boolean;
  /** Para vistas previas en vivo. */
  onChange?: (lines: LineDraft[]) => void;
}) {
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const blank = (key: number): Line => ({ key, itemId: '', description: '', quantity: '1', unit: '', discountPct: '0', taxRate: '21' });
  const [lines, setLines] = useState<Line[]>(() => (initial.length ? initial.map((l, i) => ({ ...l, key: i, readItemId: l.itemId })) : [blank(0)]));
  const [nextKey, setNextKey] = useState(initial.length || 1);

  useEffect(() => onChange?.(lines), [lines, onChange]);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pick = (key: number, itemId: string) => {
    const item = byId.get(itemId);
    update(key, item ? { itemId, description: item.name, unit: item.suggested ?? '', taxRate: item.taxRate } : { itemId: '' });
  };

  const payload = lines
    // Una línea leída de un escaneo sin artículo se envía igual: el servidor
    // la rechaza con «Elige el artículo» en vez de perderla en silencio.
    .filter((l) => l.itemId || l.read || (allowFreeText && l.description.trim()))
    .map((l) =>
      mode === 'cost'
        ? { itemId: l.itemId, quantity: l.quantity.replace(',', '.'), unitCost: l.unit.replace(',', '.') }
        : {
            itemId: l.itemId || undefined,
            description: l.description,
            quantity: l.quantity.replace(',', '.'),
            unitPrice: l.unit.replace(',', '.'),
            discountPct: l.discountPct.replace(',', '.') || '0',
            taxRate: l.taxRate.replace(',', '.'),
          },
    );

  const totals = lines.reduce(
    (acc, l) => {
      const base = round2(num(l.quantity) * num(l.unit) * (1 - (mode === 'price' ? num(l.discountPct) : 0) / 100));
      acc.base += base;
      acc.tax += mode === 'price' ? round2((base * num(l.taxRate)) / 100) : 0;
      return acc;
    },
    { base: 0, tax: 0 },
  );

  // Escritorio: columnas como una tabla. Móvil: cada línea es una ficha con
  // sus campos etiquetados (una tabla de 720px no cabe en 390px).
  const cols =
    mode === 'price'
      ? 'md:grid-cols-[minmax(0,1fr)_5rem_6rem_4rem_4rem_6rem_2.5rem]'
      : 'md:grid-cols-[minmax(0,1fr)_6rem_7rem_7rem_2.5rem]';
  const mobileLabel = 'text-xs font-semibold text-ink-3 md:sr-only';
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <input type="hidden" name={name} value={JSON.stringify(payload)} />
      <div className="-mx-4 md:-mx-5" role="table" aria-label="Líneas">
        <div role="row" className={`hidden gap-3 bg-sheet-head px-4 py-2 text-xs font-semibold text-ink-3 md:grid md:px-5 ${cols}`}>
          <span role="columnheader">Artículo{allowFreeText ? ' o concepto' : ''}</span>
          <span role="columnheader" className="text-right">Cantidad</span>
          <span role="columnheader" className="text-right">{mode === 'cost' ? 'Coste ud.' : 'Precio ud.'}</span>
          {mode === 'price' && <span role="columnheader" className="text-right">Dto. %</span>}
          {mode === 'price' && <span role="columnheader" className="text-right">IVA %</span>}
          <span role="columnheader" className="text-right">Importe</span>
          <span role="columnheader" className="sr-only">Quitar</span>
        </div>
        {lines.map((l, index) => {
          const amount = round2(num(l.quantity) * num(l.unit) * (1 - (mode === 'price' ? num(l.discountPct) : 0) / 100));
          const item = byId.get(l.itemId);
          const n = index + 1;
          return (
            <div key={l.key} role="row" className={`grid grid-cols-2 items-start gap-x-3 gap-y-2 border-b border-line-soft px-4 py-3 md:gap-y-0 md:px-5 md:py-1.5 ${cols}`}>
              <div role="cell" className="col-span-2 flex flex-col gap-1 md:col-span-1">
                <span className={mobileLabel}>Línea {n}</span>
                <select aria-label={`Artículo de la línea ${n}`} value={l.itemId} onChange={(e) => pick(l.key, e.target.value)} className={inputClass}>
                  <option value="">{allowFreeText ? 'Concepto libre…' : 'Elige un artículo…'}</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.sku} · {i.name}
                    </option>
                  ))}
                </select>
                {l.read && (
                  <p className={`text-xs ${!l.itemId ? 'font-medium text-danger' : l.match === 'probable' && l.itemId === l.readItemId ? 'text-warning' : 'text-ink-3'}`}>
                    {!l.itemId ? 'Elige el artículo · ' : l.match === 'probable' && l.itemId === l.readItemId ? 'Comprueba el artículo · ' : ''}
                    En el albarán: «{l.read}»
                  </p>
                )}
                {allowFreeText && (
                  <input
                    aria-label={`Descripción de la línea ${n}`}
                    value={l.description}
                    onChange={(e) => update(l.key, { description: e.target.value })}
                    placeholder="Descripción en la factura"
                    className={inputClass}
                  />
                )}
              </div>
              <label role="cell" className="flex flex-col gap-1">
                <span className={mobileLabel}>Cantidad{item ? ` (${item.unit})` : ''}</span>
                <input aria-label={`Cantidad de la línea ${n}`} inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} className={`${inputClass} text-right`} />
                {item && <span className="hidden text-right text-xs text-ink-3 md:block">{item.unit}</span>}
              </label>
              <label role="cell" className="flex flex-col gap-1">
                <span className={mobileLabel}>{mode === 'cost' ? 'Coste ud.' : 'Precio ud.'}</span>
                <input
                  aria-label={`${mode === 'cost' ? 'Coste' : 'Precio'} unitario de la línea ${n}`}
                  inputMode="decimal"
                  value={l.unit}
                  onChange={(e) => update(l.key, { unit: e.target.value })}
                  className={`${inputClass} text-right`}
                />
              </label>
              {mode === 'price' && (
                <label role="cell" className="flex flex-col gap-1">
                  <span className={mobileLabel}>Dto. %</span>
                  <input aria-label={`Descuento de la línea ${n}`} inputMode="decimal" value={l.discountPct} onChange={(e) => update(l.key, { discountPct: e.target.value })} className={`${inputClass} text-right`} />
                </label>
              )}
              {mode === 'price' && (
                <label role="cell" className="flex flex-col gap-1">
                  <span className={mobileLabel}>IVA %</span>
                  <input aria-label={`IVA de la línea ${n}`} inputMode="decimal" value={l.taxRate} onChange={(e) => update(l.key, { taxRate: e.target.value })} className={`${inputClass} text-right`} />
                </label>
              )}
              <p role="cell" className="flex items-baseline justify-between gap-2 font-medium md:block md:pt-2 md:text-right">
                <span className={mobileLabel}>Importe</span>
                {formatEuro(amount)}
              </p>
              <div role="cell" className="flex justify-end">
                <Button variant="ghost" className="px-2" aria-label={`Quitar línea ${n}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <Trash2 aria-hidden className="size-4" />
                  <span className="md:sr-only">Quitar</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button
          onClick={() => {
            setLines((ls) => [...ls, blank(nextKey)]);
            setNextKey((k) => k + 1);
          }}
        >
          <Plus aria-hidden className="size-4" />
          Añadir línea
        </Button>
        {showTotals && <dl className="grid min-w-56 grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-ink-3">{mode === 'cost' ? 'Total coste' : 'Base imponible'}</dt>
          <dd className="text-right font-semibold">{formatEuro(totals.base)}</dd>
          {mode === 'price' && (
            <>
              <dt className="text-ink-3">IVA</dt>
              <dd className="text-right">{formatEuro(totals.tax)}</dd>
              <dt className="font-semibold">Total</dt>
              <dd className="text-right text-base font-bold">{formatEuro(totals.base + totals.tax)}</dd>
            </>
          )}
        </dl>}
      </div>
    </div>
  );
}


/** Errores de Zod de las líneas («lines.0.itemId» → «Línea 1: elige el artículo»). */
export function LineErrors() {
  const errors = useFieldErrors();
  const messages = Object.entries(errors)
    .filter(([key]) => key === 'lines' || key.startsWith('lines.'))
    .map(([key, message]) => {
      const n = Number(key.split('.')[1]);
      return Number.isInteger(n) ? `Línea ${n + 1}: ${message.charAt(0).toLowerCase()}${message.slice(1)}` : message;
    });
  if (messages.length === 0) return null;
  return (
    <ul role="alert" className="mt-3 flex flex-col gap-1 text-sm font-medium text-danger">
      {[...new Set(messages)].map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}
