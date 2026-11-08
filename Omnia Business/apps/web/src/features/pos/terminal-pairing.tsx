'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Notice, inputClass } from '@/components/ui/form';
import { formatTime } from '@/lib/format';

type CodeResult = { ok: true; code: string; expiresAt: Date } | { ok: false; error: string };

/** El código solo se puede leer ahora: se guarda su hash, no el código. */
function CodeBox({ code, expiresAt }: { code: string; expiresAt: Date }) {
  return (
    <div className="rounded-xl border border-tint/40 bg-tint-soft p-4 text-center" role="status">
      <p className="text-xs font-semibold text-ink-3">Código de vinculación</p>
      <p className="my-1 font-mono text-3xl font-bold tracking-[0.15em]">{code}</p>
      <p className="text-xs text-ink-2">
        Tecléalo en la tablet, en la pantalla «Vincular este terminal». Caduca a las {formatTime(expiresAt)} y sirve una sola vez.
      </p>
    </div>
  );
}

export function NewTerminalForm({ warehouses, create }: { warehouses: { id: string; name: string }[]; create: (input: { name: string; warehouseId: string }) => Promise<CodeResult> }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [result, setResult] = useState<CodeResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await create({ name, warehouseId });
          setResult(r);
          if (r.ok) {
            setName('');
            router.refresh();
          }
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-3">
        Nombre
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Barra principal, Terraza…" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-3">
        Descuenta stock de
        <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={inputClass}>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      <div>
        <Button type="submit" variant="primary" disabled={pending || !name.trim() || !warehouseId}>
          {pending ? 'Creando…' : 'Crear y generar código'}
        </Button>
      </div>
      {result && !result.ok && <Notice tone="danger">{result.error}</Notice>}
      {result?.ok && <CodeBox code={result.code} expiresAt={result.expiresAt} />}
    </form>
  );
}

export function PairingCodeButton({ generate, label = 'Nuevo código' }: { generate: () => Promise<CodeResult>; label?: string }) {
  const router = useRouter();
  const [result, setResult] = useState<CodeResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant="info"
          className="h-8 px-3"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await generate();
              setResult(r);
              router.refresh();
            })
          }
        >
          {label}
        </Button>
      </div>
      {result && !result.ok && <Notice tone="danger">{result.error}</Notice>}
      {result?.ok && <CodeBox code={result.code} expiresAt={result.expiresAt} />}
    </div>
  );
}
