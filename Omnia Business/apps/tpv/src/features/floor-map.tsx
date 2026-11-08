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
  free: { label: 'Libre', card: 'bg-sheet', pill: 'bg-ok-soft text-ok', dot: 'bg-sys-green' },
  open: { label: 'Ocupada', card: 'bg-sheet ring-2 ring-inset ring-sys-red/55', pill: 'bg-danger-soft text-danger', dot: 'bg-sys-red' },
  billing: { label: 'Cobrando', card: 'bg-sheet ring-2 ring-inset ring-sys-orange/65', pill: 'bg-warning-soft text-warning', dot: 'bg-sys-orange' },
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
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-4 pt-6 md:px-6">
        <div className="mr-auto">
          <p className="text-[13px] font-semibold text-ink-3 uppercase">{busy} abiertas en total</p>
          <h1 className="text-[34px] leading-[1.1] font-bold tracking-[-0.022em]">{current?.name ?? 'Mesas'}</h1>
        </div>
        <ul className="flex flex-wrap items-center gap-4 pb-2 text-[14px] text-ink-2" aria-label="Leyenda">
          {Object.values(STATE).map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span aria-hidden className={`size-2.5 rounded-full ${s.dot}`} />
              {s.label}
            </li>
          ))}
        </ul>
        <label className="flex items-center gap-2.5 pb-1 text-[15px] font-medium">
          Solo las mías
          <input type="checkbox" role="switch" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="switch" />
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
              <Link href="/caja" className="font-semibold text-tint">Abrir caja</Link>
            ) : (
              'Avisa a un encargado para que la abra.'
            )}
          </Notice>
        )}

        {zones.length === 0 ? (
          <Notice>No hay mesas todavía. {manager ? 'Créalas en el backoffice: Ajustes › TPV › Mesas.' : 'Un encargado puede crearlas en el backoffice.'}</Notice>
        ) : (
          <nav aria-label="Zonas" className="grid gap-1 rounded-[16px] bg-fill p-1" style={{ gridTemplateColumns: `repeat(${Math.min(zones.length, 4)}, minmax(0, 1fr))` }}>
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
                  className={`pressable flex min-h-16 flex-col items-center justify-center rounded-[12px] px-4 py-2 text-center ${
                    active ? 'bg-sheet shadow-[var(--shadow-raised)] dark:bg-fill-strong' : 'hover:bg-fill'
                  }`}
                >
                  <span className={`text-[17px] ${active ? 'font-semibold text-ink' : 'font-medium text-ink-2'}`}>{z.name}</span>
                  <span className="text-[13px] text-ink-3">
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
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6" aria-label="Cuentas sin mesa">
                {zoneCounter(current.name)
                  .filter((t) => !onlyMine || t.waiterId === userId)
                  .map((t) => (
                    <li key={t.id}>
                      <TableCard href={`/cuenta/${t.id}`} name={t.label ?? `Cuenta ${t.number}`} tab={t} now={now} />
                    </li>
                  ))}
              </ul>
            )}
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
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
                        className={`pressable flex h-full min-h-36 w-full flex-col justify-between rounded-[20px] p-4 text-left shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-raised)] ${STATE.free.card}`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-[24px] leading-tight font-bold tracking-[-0.02em]">{t.name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${STATE.free.pill}`}>Libre</span>
                        </span>
                        <span className="flex items-center gap-1 text-[14px] text-ink-3">
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
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Nombre de la cuenta
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Barra, nombre del cliente…" className="h-12 rounded-[12px] bg-fill px-4 text-[17px] font-normal text-ink outline-none focus:ring-[3px] focus:ring-tint/45" autoFocus />
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
    <Link href={href} className={`pressable flex h-full min-h-36 flex-col justify-between gap-2 rounded-[20px] p-4 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-raised)] ${s.card}`}>
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[24px] leading-tight font-bold tracking-[-0.02em]">{name}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${s.pill}`}>{s.label}</span>
      </span>
      <span className="text-[14px] leading-snug">
        <span className="block truncate text-ink-2">{tab.waiterName}</span>
        {tab.unsent > 0 && <span className="block text-xs font-semibold text-warning">{tab.unsent} sin enviar a cocina</span>}
        <span className="flex items-end justify-between gap-2">
          <span className="text-ink-3" suppressHydrationWarning>
            {elapsed(tab.openedAt, now)}
          </span>
          <span className="text-[19px] font-bold tracking-[-0.01em]">{formatEuro(tab.total)}</span>
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
