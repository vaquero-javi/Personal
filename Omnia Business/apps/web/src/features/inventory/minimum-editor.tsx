'use client';

import { useActionState, useState } from 'react';
import { Check } from 'lucide-react';
import type { FormAction } from '@/components/ui/form';
import { formatQty } from '@/lib/format';

/** Mínimo editable en línea: un clic, escribir, Enter. */
export function MinimumEditor({ action, warehouseId, itemId, value }: { action: FormAction; warehouseId: string; itemId: string; value: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: Awaited<ReturnType<FormAction>>, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.ok) setEditing(false);
    return result;
  }, {});
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="rounded px-1.5 py-0.5 underline decoration-line decoration-dotted underline-offset-4 hover:bg-sheet-head" title="Cambiar mínimo">
        {formatQty(value)}
      </button>
    );
  }
  return (
    <form action={formAction} className="inline-flex items-center justify-end gap-1">
      <input type="hidden" name="warehouseId" value={warehouseId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input
        name="minQuantity"
        defaultValue={value.replace(/\.?0+$/, '')}
        inputMode="decimal"
        autoFocus
        aria-label="Nuevo mínimo"
        aria-invalid={state.error ? true : undefined}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        className="h-8 w-20 rounded-md border border-shelf-edge px-2 text-right text-sm focus:border-ink focus:ring-2 focus:ring-ink/15 focus:outline-none aria-[invalid=true]:border-danger"
      />
      <button type="submit" disabled={pending} aria-label="Guardar mínimo" className="flex size-8 items-center justify-center rounded-md bg-ink text-white disabled:opacity-50">
        <Check aria-hidden className="size-4" />
      </button>
      {state.error && <span className="sr-only" role="alert">{state.error}</span>}
    </form>
  );
}
