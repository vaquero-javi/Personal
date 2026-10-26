'use client';

import { useMemo, useState, useTransition } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CreditCard, Minus, Plus, ScanBarcode, Trash2 } from 'lucide-react';
import type { PosProduct } from '@omnia/sales/types';
import { Button } from '@/components/ui/button';
import { Notice, inputClass } from '@/components/ui/form';
import { formatEuro, formatQty } from '@/lib/format';

type Checkout = (payload: {
  warehouseId: string;
  method: 'cash' | 'card';
  tendered?: string;
  lines: { itemId: string; quantity: string }[];
}) => Promise<{ ok: true; ticket: { invoiceId: string; fullNumber: string; total: string; change: string | null } } | { ok: false; error: string }>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Terminal de punto de venta. El catálogo (precio de tarifa general y stock del
 * almacén elegido) se sincroniza con TanStack Query; el cobro es una Server
 * Action que emite el ticket F2, descuenta stock y registra el cobro en una sola
 * transacción. Los importes de aquí son orientativos: el servidor recalcula.
 */
export function PointOfSale({
  orgId,
  warehouses,
  checkout,
  invoiceBase,
}: {
  orgId: string;
  warehouses: { id: string; name: string }[];
  checkout: Checkout;
  invoiceBase: string;
}) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [method, setMethod] = useState<'cash' | 'card'>('card');
  const [tendered, setTendered] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<{ invoiceId: string; fullNumber: string; total: string; change: string | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const queryKey = ['org', orgId, 'pos', 'catalog', warehouseId] as const;

  const catalog = useQuery({
    queryKey,
    enabled: !!warehouseId,
    queryFn: async (): Promise<PosProduct[]> => {
      const res = await fetch(`/api/v1/pos/catalog?warehouse=${warehouseId}`, { headers: { 'x-organization-id': orgId } });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? 'No se pudo cargar el catálogo');
      return res.json();
    },
  });

  const products = useMemo(() => new Map((catalog.data ?? []).map((p) => [p.id, p])), [catalog.data]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (catalog.data ?? []).filter((p) => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || p.barcode === search.trim());
  }, [catalog.data, search]);

  const add = (id: string, delta = 1) =>
    setCart((c) => {
      const next = new Map(c);
      const qty = (next.get(id) ?? 0) + delta;
      if (qty <= 0) next.delete(id);
      else next.set(id, qty);
      return next;
    });

  const lines = [...cart.entries()].map(([id, qty]) => {
    const p = products.get(id);
    const base = round2(qty * Number(p?.unitPrice ?? 0));
    return { id, qty, p, base, tax: round2((base * Number(p?.taxRate ?? 0)) / 100) };
  });
  const total = lines.reduce((s, l) => s + l.base + l.tax, 0);
  const change = method === 'cash' && tendered ? Number(tendered.replace(',', '.')) - total : null;

  const pay = () => {
    setError(null);
    startTransition(async () => {
      const result = await checkout({
        warehouseId,
        method,
        ...(method === 'cash' && tendered ? { tendered: tendered.replace(',', '.') } : {}),
        lines: lines.map((l) => ({ itemId: l.id, quantity: String(l.qty) })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTicket(result.ticket);
      setCart(new Map());
      setTendered('');
      await queryClient.invalidateQueries({ queryKey: ['org', orgId, 'pos'] });
    });
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Lector de código de barras: escribe el código y pulsa Enter.
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const exact = (catalog.data ?? []).find((p) => p.barcode === search.trim() || p.sku.toLowerCase() === search.trim().toLowerCase());
    const target = exact ?? (visible.length === 1 ? visible[0] : undefined);
    if (target) {
      add(target.id);
      setSearch('');
    }
  };

  return (
    <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-px bg-line lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex min-w-0 flex-col gap-3 bg-sheet p-4 md:p-5" aria-label="Catálogo">
        <div className="flex flex-wrap gap-2">
          <label className="flex min-w-60 flex-1 items-center gap-2 rounded-md border border-shelf-edge px-3 focus-within:border-ink focus-within:ring-2 focus-within:ring-ink/15">
            <ScanBarcode aria-hidden className="size-4 text-ink-3" />
            <span className="sr-only">Buscar o escanear</span>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Escanea o busca por nombre o referencia"
              className="h-[34px] w-full bg-transparent text-sm outline-none"
            />
          </label>
          {warehouses.length > 1 && (
            <select aria-label="Almacén" value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setCart(new Map()); }} className={`${inputClass} w-auto`}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
        </div>
        {catalog.isPending ? (
          <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 xl:grid-cols-4" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-24 animate-pulse bg-sheet-head" />)}
          </div>
        ) : catalog.isError ? (
          <Notice tone="danger">{catalog.error.message}</Notice>
        ) : (
          <ul className="grid grid-cols-2 border-t border-l border-line sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => {
              const stockable = p.itemType === 'stockable';
              const inCart = cart.get(p.id) ?? 0;
              const left = Number(p.onHand) - inCart;
              const noPrice = Number(p.unitPrice) === 0;
              return (
                <li key={p.id} className="border-r border-b border-line bg-sheet">
                  <button
                    type="button"
                    onClick={() => add(p.id)}
                    disabled={noPrice || (stockable && left <= 0)}
                    className="flex h-full w-full flex-col items-start gap-1 p-3 text-left transition-colors hover:bg-sheet-head disabled:cursor-not-allowed disabled:opacity-50 md:px-4"
                  >
                    <span className="line-clamp-2 text-sm font-semibold">{p.name}</span>
                    <span className="text-xs text-ink-3">{p.sku}</span>
                    <span className="mt-auto flex w-full items-baseline justify-between gap-2 pt-1">
                      <b>{noPrice ? 'Sin precio' : formatEuro(p.unitPrice)}</b>
                      {stockable && <span className={`text-xs ${left <= 0 ? 'text-danger' : 'text-ink-3'}`}>{formatQty(left)} disp.</span>}
                    </span>
                    {inCart > 0 && <span className="text-xs font-semibold text-ok">{inCart} en el ticket</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="flex flex-col bg-sheet p-4 md:p-5" aria-label="Ticket">
        <h3 className="mb-3 text-sm font-bold">Ticket</h3>
        {ticket && (
          <div className="mb-4 rounded-md border border-ok/30 bg-[#e9f4ec] p-3 text-sm text-ok" role="status">
            <p className="font-semibold">Cobrado · {ticket.fullNumber}</p>
            <p>
              Total {formatEuro(ticket.total)}
              {ticket.change !== null && ` · Cambio ${formatEuro(ticket.change)}`}
            </p>
            <a href={`${invoiceBase}/${ticket.invoiceId}`} className="mt-1 inline-block text-ink underline underline-offset-2">
              Ver ticket y registro VeriFactu
            </a>
          </div>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        {lines.length === 0 ? (
          <p className="rounded bg-sheet-head px-3 py-6 text-center text-sm text-ink-2">Toca un artículo o escanea su código para empezar.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{l.p?.name}</span>
                  <span className="text-xs text-ink-3">{formatEuro(l.p?.unitPrice ?? 0)} + IVA {Number(l.p?.taxRate ?? 0)} %</span>
                </span>
                <Button variant="ghost" className="size-8 px-0" aria-label={`Quitar una unidad de ${l.p?.name}`} onClick={() => add(l.id, -1)}>
                  {l.qty === 1 ? <Trash2 aria-hidden className="size-4" /> : <Minus aria-hidden className="size-4" />}
                </Button>
                <span className="w-6 text-center font-semibold">{l.qty}</span>
                <Button variant="ghost" className="size-8 px-0" aria-label={`Añadir una unidad de ${l.p?.name}`} onClick={() => add(l.id)}>
                  <Plus aria-hidden className="size-4" />
                </Button>
                <span className="w-20 text-right">{formatEuro(l.base + l.tax)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
          <p className="flex items-baseline justify-between">
            <span className="text-sm text-ink-2">Total (IVA incl.)</span>
            <b className="text-2xl">{formatEuro(total)}</b>
          </p>
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="sr-only">Forma de pago</legend>
            {(['card', 'cash'] as const).map((m) => (
              <label key={m} className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${method === m ? 'border-ink bg-ink text-white' : 'border-shelf-edge'}`}>
                <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
                {m === 'card' ? <CreditCard aria-hidden className="size-4" /> : <Banknote aria-hidden className="size-4" />}
                {m === 'card' ? 'Tarjeta' : 'Efectivo'}
              </label>
            ))}
          </fieldset>
          {method === 'cash' && (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink-2">Entregado</span>
              <input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder="0,00" className={`${inputClass} w-32 text-right`} />
            </label>
          )}
          {change !== null && (
            <p className={`flex justify-between text-sm ${change < 0 ? 'text-danger' : ''}`}>
              <span>{change < 0 ? 'Falta' : 'Cambio'}</span>
              <b>{formatEuro(Math.abs(change))}</b>
            </p>
          )}
          <Button variant="primary" className="h-11 text-base" disabled={pending || lines.length === 0 || (change !== null && change < 0)} onClick={pay}>
            {pending ? 'Cobrando…' : `Cobrar ${formatEuro(total)}`}
          </Button>
        </div>
      </aside>
    </div>
  );
}
