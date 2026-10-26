'use client';

import { useState } from 'react';
import { ActionForm, SelectField, TextField, type FormAction } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';

type Option = { value: string; label: string };

export function AdjustmentForm({ action, items, warehouses }: { action: FormAction; items: Option[]; warehouses: Option[] }) {
  const [kind, setKind] = useState<'adjustment' | 'transfer'>('adjustment');
  return (
    <ActionForm action={action} className="flex flex-col gap-4" resetOnSuccess>
      <fieldset className="flex gap-1 rounded-md bg-sheet-head p-1 text-sm">
        <legend className="sr-only">Tipo de movimiento</legend>
        {(['adjustment', 'transfer'] as const).map((k) => (
          <label key={k} className={`flex-1 cursor-pointer rounded px-3 py-1.5 text-center ${kind === k ? 'bg-sheet font-semibold shadow-sm' : 'text-ink-2'}`}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {k === 'adjustment' ? 'Ajuste de inventario' : 'Traspaso'}
          </label>
        ))}
      </fieldset>
      <SelectField label="Artículo" name="itemId" options={items} placeholder="Elige…" required />
      <SelectField label={kind === 'transfer' ? 'Desde' : 'Almacén'} name="warehouseId" options={warehouses} defaultValue={warehouses[0]?.value} />
      {kind === 'transfer' && <SelectField label="Hacia" name="toWarehouseId" options={warehouses} placeholder="Elige…" />}
      <TextField
        label="Cantidad"
        name="quantity"
        inputMode="decimal"
        required
        hint={kind === 'adjustment' ? 'Positiva si sobra (recuento), negativa si falta (rotura, merma)' : 'Unidades que cambian de almacén'}
      />
      {kind === 'adjustment' && <TextField label="Coste unitario" name="unitCost" inputMode="decimal" hint="Solo para entradas; vacío = coste medio actual" />}
      <TextField label="Motivo" name="note" required placeholder={kind === 'adjustment' ? 'Recuento de inventario de octubre' : 'Reposición de Nave 2'} />
      <div>
        <SubmitButton pendingLabel="Registrando…">{kind === 'adjustment' ? 'Registrar ajuste' : 'Registrar traspaso'}</SubmitButton>
      </div>
    </ActionForm>
  );
}
