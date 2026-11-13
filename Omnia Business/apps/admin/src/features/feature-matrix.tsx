'use client';

import { useId, useState } from 'react';
import { z } from 'zod';
import { AdminOrganizationFeature, featureTree, type FeatureNode } from '@omnia/entitlements/contracts';
import { Badge, Notice, inputClass } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

type Row = AdminOrganizationFeature;

const SetFeatureResponse = z.object({ features: z.array(AdminOrganizationFeature) });

/** Fecha (AAAA-MM-DD, hora local del navegador) → fin de ese día en ISO, o null. */
const endOfDay = (date: string) => (date ? new Date(`${date}T23:59:59`).toISOString() : null);
const toDateInput = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) : '';

/**
 * Matriz de módulos de una sociedad para el equipo de Omnia: un interruptor por
 * módulo y submódulo, con caducidad opcional. Cada cambio se guarda al momento
 * (PUT) y la respuesta trae la matriz recalculada, porque activar o quitar un
 * padre cambia lo que es efectivo en sus hijos. La sociedad lo ve en menos de un
 * minuto, o al volver a su pestaña, sin recargar.
 */
export function FeatureMatrix({ organizationId, initial }: { organizationId: string; initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const byCode = new Map(rows.map((r) => [r.code, r]));

  async function save(code: string, isActive: boolean, expiresAt: string | null) {
    const previous = rows;
    setError(null);
    setSaving((s) => new Set(s).add(code));
    // Optimista: el interruptor responde ya; si el servidor dice que no, se deshace.
    setRows((rs) => rs.map((r) => (r.code === code ? { ...r, isActive, expiresAt: expiresAt ? new Date(expiresAt) : null } : r)));
    try {
      const response = await fetch(`/api/organizations/${organizationId}/features/${encodeURIComponent(code)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive, expiresAt }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const problem = body as { detail?: string; issues?: { message: string }[] } | null;
        throw new Error(problem?.issues?.[0]?.message ?? problem?.detail ?? `Error ${response.status}`);
      }
      setRows(SetFeatureResponse.parse(body).features);
    } catch (e) {
      setRows(previous);
      setError(`${byCode.get(code)?.name ?? code}: ${e instanceof Error ? e.message : 'no se ha podido guardar'}`);
    } finally {
      setSaving((s) => {
        const next = new Set(s);
        next.delete(code);
        return next;
      });
    }
  }

  // Primero lo que se puede activar; la base (sin interruptores) al final y en una sola tarjeta.
  const hasPaid = (node: FeatureNode<Row>): boolean => !node.feature.isCore || node.children.some(hasPaid);
  const tree = featureTree(rows);
  const paid = tree.filter(hasPaid);
  const core = tree.filter((n) => !hasPaid(n));
  return (
    <>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 md:gap-5 lg:grid-cols-[repeat(2,minmax(0,1fr))]">
        {paid.map((root) => (
          <section key={root.feature.code} className="min-w-0 rounded-[var(--radius-card)] bg-sheet shadow-[var(--shadow-card)]">
            <ul className="divide-y divide-line-soft">
              <FeatureRows node={root} depth={0} byCode={byCode} saving={saving} onSave={save} />
            </ul>
          </section>
        ))}
        {core.length > 0 && (
          <section className="min-w-0 rounded-[var(--radius-card)] bg-sheet px-4 py-3.5 shadow-[var(--shadow-card)] md:px-5">
            <h3 className="text-[17px] font-semibold">Incluido en la base</h3>
            <p className="text-[13px] text-ink-3">Siempre activo en todas las sociedades; no se puede quitar.</p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {core.map((n) => (
                <li key={n.feature.code} title={n.feature.description}>
                  <Badge tone="neutral">{n.feature.name}</Badge>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function FeatureRows({
  node,
  depth,
  byCode,
  saving,
  onSave,
}: {
  node: FeatureNode<Row>;
  depth: number;
  byCode: ReadonlyMap<string, Row>;
  saving: ReadonlySet<string>;
  onSave: (code: string, isActive: boolean, expiresAt: string | null) => void;
}) {
  return (
    <>
      <FeatureRow row={node.feature} depth={depth} parent={node.feature.parentCode ? byCode.get(node.feature.parentCode) : undefined} busy={saving.has(node.feature.code)} onSave={onSave} />
      {node.children.map((child) => (
        <FeatureRows key={child.feature.code} node={child} depth={depth + 1} byCode={byCode} saving={saving} onSave={onSave} />
      ))}
    </>
  );
}

function FeatureRow({
  row,
  depth,
  parent,
  busy,
  onSave,
}: {
  row: Row;
  depth: number;
  parent: Row | undefined;
  busy: boolean;
  onSave: (code: string, isActive: boolean, expiresAt: string | null) => void;
}) {
  const switchId = useId();
  const dateId = useId();
  const expired = row.isActive && row.expiresAt !== null && row.expiresAt.getTime() <= Date.now();
  const blockedByParent = row.isActive && !expired && parent !== undefined && !parent.isEffective;

  return (
    <li className={`flex flex-col gap-2 py-3.5 pr-4 md:pr-5 ${depth === 0 ? 'pl-4 md:pl-5' : depth === 1 ? 'pl-8 md:pl-10' : 'pl-12 md:pl-15'}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={row.isCore ? undefined : switchId} className={`block ${depth === 0 ? 'text-[17px] font-semibold' : 'text-[15px] font-medium'}`}>
            {row.name}
          </label>
          <p className="text-[13px] text-ink-3">{row.description}</p>
          <p className="mt-0.5 font-mono text-[11px] text-ink-3">{row.code}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {row.isCore ? (
              <Badge tone="neutral">Incluido en la base</Badge>
            ) : row.isEffective ? (
              <Badge tone="ok">{row.expiresAt ? `Activo hasta ${formatDateTime(row.expiresAt)}` : 'Activo'}</Badge>
            ) : expired ? (
              <Badge tone="danger">Caducó el {formatDateTime(row.expiresAt)}</Badge>
            ) : blockedByParent ? (
              <Badge tone="warning">Sin efecto: «{parent.name}» no está activo</Badge>
            ) : null}
            {row.pendingRequestAt && (
              <Badge tone="info">Solicitado {formatDateTime(row.pendingRequestAt)}</Badge>
            )}
          </div>
          {row.pendingRequestMessage && <p className="mt-1.5 rounded-[10px] bg-fill px-3 py-2 text-[13px] text-ink-2">«{row.pendingRequestMessage}»</p>}
        </div>
        {!row.isCore && (
          <input
            id={switchId}
            type="checkbox"
            role="switch"
            className="switch mt-0.5"
            checked={row.isActive}
            disabled={busy}
            aria-busy={busy}
            aria-describedby={row.isActive ? dateId : undefined}
            onChange={(e) => onSave(row.code, e.target.checked, null)}
          />
        )}
      </div>
      {!row.isCore && row.isActive && (
        <div className="flex items-center gap-2 text-[13px] text-ink-2">
          <label htmlFor={dateId} className="shrink-0">
            Caduca
          </label>
          <input
            id={dateId}
            type="date"
            disabled={busy}
            min={toDateInput(new Date())}
            defaultValue={toDateInput(row.expiresAt)}
            key={row.expiresAt?.toISOString() ?? 'none'}
            onBlur={(e) => {
              const next = endOfDay(e.target.value);
              const current = row.expiresAt?.toISOString() ?? null;
              if (toDateInput(next ? new Date(next) : null) !== toDateInput(current ? new Date(current) : null)) onSave(row.code, true, next);
            }}
            className={`${inputClass} h-8 max-w-[10.5rem] text-[13px]`}
          />
          {!row.expiresAt && <span className="whitespace-nowrap text-ink-3">Sin caducidad</span>}
        </div>
      )}
    </li>
  );
}
