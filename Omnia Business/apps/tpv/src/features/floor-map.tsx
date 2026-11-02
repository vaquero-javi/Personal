'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Users } from 'lucide-react';
import type { FloorTable, TabSummary } from '@omnia/pos/types';
import { Button, Modal, Notice, useFlash } from '@/components/ui';
import { elapsed, formatEuro } from '@/lib/format';
import { openTab } from '@/server/actions';
import { useAutoRefresh } from './use-auto-refresh';

const STATE = {
  free: { label: 'Libre', card: 'border-ok-line bg-ok-soft hover:border-ok', dot: 'bg-ok' },
  open: { label: 'Ocupada', card: 'border-danger/60 bg-danger-soft hover:border-danger', dot: 'bg-danger' },
  billing: { label: 'Cobrando', card: 'border-warning-line bg-warning-soft hover:border-warning', dot: 'bg-warning-line' },
} as const;

const COUNTER_ZONE = /^barra$/i;
const ZONE_KEY = 'omnia_tpv_zona';

const stateOf = (tab: TabSummary | null) => (tab ? (tab.status === 'billing' ? 'billing' : 'open') : 'free');

export function FloorMap({ tables, counterTabs, cashOpen, manager, userId }: {
  tables: FloorTable[];
  counterTabs: TabSummary[];
  cashOpen: boolean;
  manager: boolean;
  userId: string;
}) {
  const router = useRouter();
  const [flash, show] = useFlash();
  const [pending, start] = useTransition();
  const [counterOpen, setCounterOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const now = useNow();
  useAutoRefresh(5_000);

  // Zonas de la sala (Barra, Sala, Terraza…). Las cuentas sin mesa van con la barra.
  const zones = useMemo(() => {
    const map = new Map<string, FloorTable[]>();
    for (const t of tables) map.set(t.area, [...(map.get(t.area) ?? []), t]);
    const list = [...map].map(([name, zoneTables]) => ({ name, tables: zoneTables }));
    if (counterTabs.length > 0 && !list.some((z) => COUNTER_ZONE.test(z.name))) list.push({ name: 'Sin mesa', tables: [] });
    return list;
  }, [tables, counterTabs.length]);
  const [zone, setZone] = useZone(zones.map((z) => z.name));
  const current = zones.find((z) => z.name === zone) ?? zones[0];
  const zoneCounter = (name: string) => (COUNTER_ZONE.test(name) || name === 'Sin mesa' ? counterTabs : []);
  const busy = tables.filter((t) => t.tab).length + counterTabs.length;

  const open = (input: { tableId?: string; label?: string }) =>
    start(async () => {
      const result = await openTab({ ...input, guests: input.tableId ? 2 : 1 });
      if (result.ok) router.push(`/cuenta/${result.data}`);
      else show(result.error, 'danger');
    });

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-wrap items-center gap-3 border-b border-shelf-edge bg-sheet px-4 py-3 md:px-6">
        <h1 className="text-lg font-bold">{current?.name ?? 'Mesas'}</h1>
        <p className="text-sm text-ink-3">{busy} abiertas en total</p>
        <ul className="ml-auto flex flex-wrap items-center gap-4 text-sm text-ink-2" aria-label="Leyenda">
          {Object.values(STATE).map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span aria-hidden className={`size-3 rounded-full ${s.dot}`} />
              {s.label}
            </li>
          ))}
        </ul>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="size-5 accent-ink" />
          Solo las mías
        </label>
        <Button variant="primary" onClick={() => setCounterOpen(true)} disabled={pending}>
          <Plus className="size-4" aria-hidden />
          Cuenta de barra
        </Button>
      </div>

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {!cashOpen && (
          <Notice tone="warning">
            La caja de este terminal está cerrada: se pueden tomar comandas, pero no cobrar.{' '}
            {manager ? (
              <Link href="/caja" className="font-semibold underline">Abrir caja</Link>
            ) : (
              'Avisa a un encargado para que la abra.'
            )}
          </Notice>
        )}

        {zones.length === 0 ? (
          <Notice>No hay mesas todavía. {manager ? 'Créalas en el backoffice: Ajustes › TPV › Mesas.' : 'Un encargado puede crearlas en el backoffice.'}</Notice>
        ) : (
          <nav aria-label="Zonas" className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(zones.length, 4)}, minmax(0, 1fr))` }}>
            {zones.map((z) => {
              const counters = zoneCounter(z.name);
              const occupied = z.tables.filter((t) => t.tab).length;
              const active = current?.name === z.name;
              return (
                <button
                  key={z.name}
                  type="button"
                  onClick={() => setZone(z.name)}
                  aria-pressed={active}
                  className={`flex min-h-20 flex-col items-start justify-center rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                    active ? 'border-ink bg-ink text-white' : 'border-shelf-edge bg-sheet hover:border-ink'
                  }`}
                >
                  <span className="text-xl font-bold">{z.name}</span>
                  <span className={`text-sm ${active ? 'text-white/80' : 'text-ink-3'}`}>
                    {z.tables.length > 0 ? `${occupied} de ${z.tables.length} ocupadas` : `${counters.length} cuentas abiertas`}
                    {counters.length > 0 && z.tables.length > 0 && ` · ${counters.length} sin mesa`}
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        {current && (
          <section aria-label={current.name} className="flex flex-col gap-4">
            {zoneCounter(current.name).length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6" aria-label="Cuentas sin mesa">
                {zoneCounter(current.name)
                  .filter((t) => !onlyMine || t.waiterId === userId)
                  .map((t) => (
                    <li key={t.id}>
                      <TableCard href={`/cuenta/${t.id}`} name={t.label ?? `Cuenta ${t.number}`} tab={t} now={now} />
                    </li>
                  ))}
              </ul>
            )}
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {current.tables
                .filter((t) => !onlyMine || t.tab?.waiterId === userId || !t.tab)
                .map((t) =>
                  t.tab ? (
                    <li key={t.id}>
                      <TableCard href={`/cuenta/${t.tab.id}`} name={t.name} tab={t.tab} now={now} />
                    </li>
                  ) : (
                    <li key={t.id}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => open({ tableId: t.id })}
                        className={`flex h-full min-h-32 w-full flex-col justify-between rounded-xl border-2 p-3 text-left transition-colors ${STATE.free.card}`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-xl font-bold">{t.name}</span>
                          <span className="text-xs font-semibold text-ok">Libre</span>
                        </span>
                        <span className="flex items-center gap-1 text-sm text-ink-3">
                          <Users className="size-4" aria-hidden />
                          {t.seats}
                        </span>
                      </button>
                    </li>
                  ),
                )}
            </ul>
          </section>
        )}
      </div>

      <Modal open={counterOpen} onClose={() => setCounterOpen(false)} title="Nueva cuenta de barra">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim()) open({ label: label.trim() });
          }}
        >
          <div className="flex flex-wrap gap-2">
            {['Barra', 'Para llevar', 'Terraza de pie'].map((l) => (
              <Button key={l} onClick={() => setLabel(l)} variant={label === l ? 'primary' : 'secondary'}>
                {l}
              </Button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-3">
            Nombre de la cuenta
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Barra, nombre del cliente…" className="h-12 rounded-lg border border-shelf-edge px-3 text-base font-normal text-ink" autoFocus />
          </label>
          <Button type="submit" variant="primary" size="lg" disabled={!label.trim() || pending}>
            Abrir cuenta
          </Button>
        </form>
      </Modal>
      {flash}
    </div>
  );
}

function TableCard({ href, name, tab, now }: { href: string; name: string; tab: TabSummary; now: number }) {
  const s = STATE[stateOf(tab)];
  return (
    <Link href={href} className={`flex h-full min-h-32 flex-col justify-between gap-2 rounded-xl border-2 p-3 transition-colors ${s.card}`}>
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-xl font-bold">{name}</span>
        <span className="shrink-0 text-xs font-semibold">{s.label}</span>
      </span>
      <span className="text-sm leading-snug">
        <span className="block truncate text-ink-2">{tab.waiterName}</span>
        {tab.unsent > 0 && <span className="block text-xs font-semibold text-warning">{tab.unsent} sin enviar a cocina</span>}
        <span className="flex items-end justify-between gap-2">
          <span className="text-ink-3" suppressHydrationWarning>
            {elapsed(tab.openedAt, now)}
          </span>
          <span className="text-lg font-bold">{formatEuro(tab.total)}</span>
        </span>
      </span>
    </Link>
  );
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Zona elegida, recordada en este terminal (si el navegador lo permite). */
function useZone(names: string[]) {
  const [zone, setZone] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ZONE_KEY);
      if (saved && names.includes(saved)) setZone(saved);
    } catch {
      // Sin almacenamiento: se empieza por la primera zona.
    }
    // Solo al montar: cambiar de zona no debe pisarse al refrescar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const choose = (name: string) => {
    setZone(name);
    try {
      localStorage.setItem(ZONE_KEY, name);
    } catch {
      // Sin almacenamiento: la elección dura hasta recargar.
    }
  };
  return [zone, choose] as const;
}
