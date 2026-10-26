'use client';

import { useActionState } from 'react';
import type { FormAction } from '@/components/ui/form';

/** Precio editable en línea; se guarda al salir del campo o con Enter. */
export function PriceEditor({ action, value, label }: { action: FormAction; value: string | null; label: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="inline-flex items-center justify-end gap-2">
      {state.error && <span role="alert" className="text-xs text-danger">{state.error}</span>}
      {state.ok && !pending && <span className="text-xs text-ok">Guardado</span>}
      <input
        name="unitPrice"
        aria-label={label}
        defaultValue={value ? Number(value).toString().replace('.', ',') : ''}
        inputMode="decimal"
        placeholder="—"
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        aria-invalid={state.error ? true : undefined}
        className="h-8 w-28 rounded-md border border-shelf-edge px-2 text-right text-sm focus:border-ink focus:ring-2 focus:ring-ink/15 focus:outline-none aria-[invalid=true]:border-danger"
      />
    </form>
  );
}
