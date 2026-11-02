'use client';

import { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowLeftRight, ChefHat, Minus, Plus, Printer, Trash2, Users, WifiOff } from 'lucide-react';
import type { CheckoutResult, MenuProduct, PosCategory, TabDetail } from '@omnia/pos/types';
import { Button, Modal, Notice, useFlash } from '@/components/ui';
import { elapsed, formatEuro, formatQty, formatTime } from '@/lib/format';
import { cancelTab, moveTab, precheck, sendToKitchen, setGuests, setLineDiscount, setLineNote } from '@/server/actions';
import { CheckoutPanel } from './checkout-panel';
import { ProductPicker } from './product-picker';
import { lineTotals, useTabLines, type LocalLine } from './use-tab-lines';

export function TabScreen({ tab, categories, products, freeTables, cashOpen, manager, allowNegativeStock }: {
  tab: TabDetail;
  categories: PosCategory[];
  products: MenuProduct[];
  freeTables: { id: string; name: string; area: string }[];
  cashOpen: boolean;
  manager: boolean;
  allowNegativeStock: boolean;
}) {
  const router = useRouter();
  const [flash, show] = useFlash();
  const onError = useCallback((m: string) => show(m, 'danger'), [show]);
  const { lines, setQuantity, addProduct, totals, pending, offline } = useTabLines(tab, onError);
  const [busy, start] = useTransition();
  const [view, setView] = useState<'ticket' | 'menu'>('menu');
  const [editing, setEditing] = useState<LocalLine | null>(null);
  const [moving, setMoving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [paid, setPaid] = useState<CheckoutResult | null>(null);
  const closed = tab.status === 'paid';
  const unsent = lines.filter((l) => !l.sentAt).length;
  const title = tab.table ? tab.table.name : (tab.label ?? `Cuenta ${tab.number}`);

  const act = (work: () => Promise<{ ok: boolean; error?: string; message?: string }>, done?: () => void) =>
    start(async () => {
      const result = await work();
      if (!result.ok) return show(result.error ?? 'No se pudo hacer', 'danger');
      if (result.message) show(result.message);
      done?.();
      router.refresh();
    });

  // Recién cobrada desde aquí, la pantalla sigue para enseñar el cambio aunque
  // el servidor ya la devuelva como pagada.
  if (closed && paid === null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border border-shelf-edge bg-sheet p-6 text-center">
          <p className="text-lg font-bold">{title} ya está cobrada</p>
          <div className="flex gap-3">
            {tab.invoiceId && (
              <Link href={`/imprimir/ticket/${tab.invoiceId}`} className="inline-flex h-11 items-center gap-2 rounded-lg border border-shelf-edge px-4 text-sm font-semibold">
                <Printer className="size-4" aria-hidden /> Ticket
              </Link>
            )}
            <Link href="/mesas" className="inline-flex h-11 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-white">Volver a mesas</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Móvil: una mitad cada vez. Tablet y escritorio: pantalla dividida. */}
      <div className="flex border-b border-shelf-edge bg-sheet p-2 md:hidden" role="tablist">
        {(['ticket', 'menu'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className="h-10 flex-1 rounded-lg text-sm font-semibold aria-selected:bg-ink aria-selected:text-white"
          >
            {v === 'ticket' ? `Cuenta · ${formatEuro(totals.total)}` : 'Carta'}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-2">
        <section aria-label="Cuenta" className={`min-h-0 flex-col border-shelf-edge bg-sheet md:flex md:border-r ${view === 'ticket' ? 'flex' : 'hidden'}`}>
          <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <Link href="/mesas" aria-label="Volver a mesas" className="flex size-11 items-center justify-center rounded-lg hover:bg-sheet-head">
              <ArrowLeft className="size-5" aria-hidden />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold leading-tight">
                {title}
                {tab.status === 'billing' && <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 align-middle text-xs font-semibold text-warning">Pre-ticket impreso</span>}
              </h1>
              <p className="truncate text-xs text-ink-3" suppressHydrationWarning>
                {tab.waiterName} · abierta a las {formatTime(tab.openedAt)} ({elapsed(tab.openedAt)}) · nº {tab.number}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-shelf-edge" aria-label="Comensales">
              <button type="button" className="flex size-10 items-center justify-center disabled:opacity-40" aria-label="Un comensal menos" disabled={tab.guests <= 1 || busy} onClick={() => act(() => setGuests(tab.id, tab.guests - 1))}>
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="flex min-w-10 items-center justify-center gap-1 text-sm font-semibold">
                <Users className="size-4" aria-hidden /> {tab.guests}
              </span>
              <button type="button" className="flex size-10 items-center justify-center disabled:opacity-40" aria-label="Un comensal más" disabled={busy} onClick={() => act(() => setGuests(tab.id, tab.guests + 1))}>
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
          </header>

          <div className="flex flex-wrap gap-2 border-b border-line px-3 py-2">
            <Button
              size="sm"
              disabled={lines.length === 0 || pending > 0 || busy}
              onClick={() => act(() => precheck(tab.id), () => router.push(`/imprimir/preticket/${tab.id}`))}
            >
              <Printer className="size-4" aria-hidden /> Pre-ticket
            </Button>
            <Button size="sm" disabled={busy || !tab.table} onClick={() => setMoving(true)} title={tab.table ? undefined : 'Las cuentas de barra se pasan a mesa desde aquí cuando estén en una'}>
              <ArrowLeftRight className="size-4" aria-hidden /> Cambiar de mesa
            </Button>
            <Button size="sm" variant="ghost" className="text-danger" disabled={busy || pending > 0} onClick={() => setCancelling(true)}>
              <Trash2 className="size-4" aria-hidden /> Anular
            </Button>
            <Button
              size="sm"
              variant={unsent > 0 ? 'primary' : 'secondary'}
              className="ml-auto"
              disabled={unsent === 0 || pending > 0 || busy}
              onClick={() => act(async () => {
                const r = await sendToKitchen(tab.id);
                return r.ok ? { ok: true, message: `${r.data} ${r.data === 1 ? 'línea enviada' : 'líneas enviadas'} a cocina` } : r;
              })}
            >
              <ChefHat className="size-4" aria-hidden /> Enviar a cocina{unsent > 0 && ` (${unsent})`}
            </Button>
          </div>

          {offline && (
            <p className="flex items-center gap-2 bg-warning-soft px-4 py-2 text-sm font-semibold text-warning" role="status">
              <WifiOff className="size-4" aria-hidden /> Sin conexión: los cambios se guardan en cuanto vuelva.
            </p>
          )}

          <ol className="min-h-0 flex-1 divide-y divide-line-soft overflow-y-auto" aria-label="Consumiciones">
            {lines.length === 0 && <li className="p-6 text-center text-sm text-ink-3">Toca un producto de la carta para añadirlo.</li>}
            {lines.map((l) => {
              const t = lineTotals(l);
              return (
                <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex items-center rounded-lg border border-shelf-edge">
                    <button type="button" onClick={() => setQuantity(l.id, l.quantity - 1)} aria-label={`Quitar un ${l.description}`} className="flex size-11 items-center justify-center">
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <span className="w-8 text-center text-base font-bold">{formatQty(l.quantity)}</span>
                    <button type="button" onClick={() => setQuantity(l.id, l.quantity + 1)} aria-label={`Añadir un ${l.description}`} className="flex size-11 items-center justify-center">
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                  <button type="button" onClick={() => setEditing(l)} className="min-w-0 flex-1 rounded-md px-1 py-1 text-left hover:bg-sheet-head">
                    <span className="block truncate font-semibold">{l.description}</span>
                    <span className="block truncate text-xs text-ink-3">
                      {formatEuro(t.unitGross)}/ud
                      {Number(l.discountPct) > 0 && <span className="font-semibold text-ok"> · −{formatQty(l.discountPct)} %</span>}
                      {l.note && ` · ${l.note}`}
                      {l.sentAt && <span className="font-semibold text-ink-2"> · En cocina</span>}
                    </span>
                  </button>
                  <span className="w-20 text-right font-bold">{formatEuro(t.total)}</span>
                </li>
              );
            })}
          </ol>

          <CheckoutPanel
            tabId={tab.id}
            total={totals.total}
            tax={totals.tax}
            disabledReason={
              !cashOpen ? 'Caja cerrada: un encargado debe abrirla' : lines.length === 0 ? 'La cuenta está vacía' : pending > 0 ? 'Guardando…' : null
            }
            onPaid={setPaid}
            onError={onError}
          />
        </section>

        <section aria-label="Carta" className={`min-h-0 flex-col md:flex ${view === 'menu' ? 'flex' : 'hidden'}`}>
          <ProductPicker categories={categories} products={products} onPick={addProduct} allowNegativeStock={allowNegativeStock} />
        </section>
      </div>

      <LineDialog
        line={editing}
        manager={manager}
        onClose={() => setEditing(null)}
        onRemove={(l) => {
          setQuantity(l.id, 0);
          setEditing(null);
        }}
        onNote={(l, note) => act(() => setLineNote(l.id, note), () => setEditing(null))}
        onDiscount={(l, pct) => act(() => setLineDiscount(l.id, pct), () => setEditing(null))}
      />

      <Modal open={moving} onClose={() => setMoving(false)} title={`Pasar ${title} a otra mesa`}>
        {freeTables.length === 0 ? (
          <Notice>No hay mesas libres.</Notice>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {freeTables.map((t) => (
              <li key={t.id}>
                <Button size="lg" className="w-full" disabled={busy} onClick={() => act(() => moveTab(tab.id, t.id), () => setMoving(false))}>
                  <span className="flex flex-col leading-tight">
                    {t.name}
                    <span className="text-xs font-normal text-ink-3">{t.area}</span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <CancelDialog
        open={cancelling}
        needsManager={lines.length > 0 && !manager}
        onClose={() => setCancelling(false)}
        onConfirm={(reason) => act(() => cancelTab(tab.id, reason), () => router.push('/mesas'))}
        busy={busy}
      />

      <Modal open={paid !== null} onClose={() => router.push('/mesas')} title="Cobrado">
        {paid && (
          <div className="flex flex-col gap-5 text-center">
            <div>
              <p className="text-sm text-ink-3">Ticket {paid.fullNumber} · {paid.method === 'card' ? 'Tarjeta' : 'Efectivo'}</p>
              <p className="text-4xl font-bold">{formatEuro(paid.total)}</p>
            </div>
            {paid.change !== null && (
              <div className="rounded-xl bg-ok-soft p-4 text-ok">
                <p className="text-sm font-semibold">Cambio a devolver</p>
                <p className="text-5xl font-bold">{formatEuro(paid.change)}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Button size="lg" onClick={() => router.push(`/imprimir/ticket/${paid.invoiceId}`)}>
                <Printer className="size-5" aria-hidden /> Imprimir ticket
              </Button>
              <Button size="lg" variant="primary" onClick={() => router.push('/mesas')}>Volver a mesas</Button>
            </div>
          </div>
        )}
      </Modal>
      {flash}
    </div>
  );
}

function LineDialog({ line, manager, onClose, onRemove, onNote, onDiscount }: {
  line: LocalLine | null;
  manager: boolean;
  onClose: () => void;
  onRemove: (l: LocalLine) => void;
  onNote: (l: LocalLine, note: string) => void;
  onDiscount: (l: LocalLine, pct: string) => void;
}) {
  const [note, setNote] = useState('');
  const [key, setKey] = useState<string | null>(null);
  if (line && key !== line.id) {
    setKey(line.id);
    setNote(line.note ?? '');
  }
  return (
    <Modal open={line !== null} onClose={onClose} title={line?.description ?? ''}>
      {line && (
        <div className="flex flex-col gap-5">
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onNote(line, note);
            }}
          >
            <label htmlFor="note" className="text-xs font-semibold text-ink-3">Nota para cocina</label>
            <div className="flex gap-2">
              <input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Sin hielo, poco hecha…" className="h-11 min-w-0 flex-1 rounded-lg border border-shelf-edge px-3" />
              <Button type="submit" variant="primary">Guardar</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {['Sin hielo', 'Poco hecha', 'Al punto', 'Sin gluten', 'Para compartir'].map((n) => (
                <Button key={n} size="sm" onClick={() => setNote(n)}>{n}</Button>
              ))}
            </div>
          </form>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-ink-3">Descuento</p>
            {manager ? (
              <div className="flex flex-wrap gap-2">
                {['0', '10', '20', '50', '100'].map((p) => (
                  <Button key={p} variant={Number(line.discountPct) === Number(p) ? 'primary' : 'secondary'} onClick={() => onDiscount(line, p)}>
                    {p === '0' ? 'Sin descuento' : p === '100' ? 'Invitación' : `−${p} %`}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-3">Los descuentos e invitaciones los aplica un encargado.</p>
            )}
          </div>
          <Button variant="danger" size="lg" onClick={() => onRemove(line)} disabled={line.sentAt !== null && !manager}>
            <Trash2 className="size-5" aria-hidden />
            {line.sentAt !== null && !manager ? 'Ya está en cocina: lo quita un encargado' : 'Quitar de la cuenta'}
          </Button>
        </div>
      )}
    </Modal>
  );
}

function CancelDialog({ open, needsManager, onClose, onConfirm, busy }: { open: boolean; needsManager: boolean; onClose: () => void; onConfirm: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Anular la cuenta">
      {needsManager ? (
        <Notice tone="warning">La cuenta tiene consumiciones: anularla es cosa de un encargado. Bloquea el terminal y que entre con su PIN.</Notice>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(reason);
          }}
        >
          <label htmlFor="reason" className="text-xs font-semibold text-ink-3">Motivo</label>
          <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Mesa abierta por error, cliente se marcha…" className="h-11 rounded-lg border border-shelf-edge px-3" />
          <Button type="submit" variant="danger" size="lg" disabled={busy}>Anular cuenta</Button>
        </form>
      )}
    </Modal>
  );
}
