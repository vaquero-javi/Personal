'use client';

import { useState } from 'react';
import { ActionForm, SelectField, TextField, inputClass, type FormAction } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';

type Option = { value: string; label: string };
export type AdjustableItem = Option & { unit: string; pack?: { unit: string; size: string } };

const num = (s: string) => Number(s.trim().replace(',', '.'));
const fmt = (n: number) => Number(n.toFixed(4)).toString().replace('.', ',');

/**
 * Ajuste o traspaso. Si el artículo se compra en cajas, se puede apuntar en
 * cajas: aquí se convierte a la unidad de stock antes de enviarlo.
 */
export function AdjustmentForm({ action, items, warehouses }: { action: FormAction; items: AdjustableItem[]; warehouses: Option[] }) {
  const [kind, setKind] = useState<'adjustment' | 'transfer'>('adjustment');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [inPacks, setInPacks] = useState(false);
  const item = items.find((i) => i.value === itemId);
  const factor = inPacks && item?.pack ? num(item.pack.size) : 1;
  const valid = quantity.trim() !== '' && Number.isFinite(num(quantity));
  const shownUnit = inPacks && item?.pack ? item.pack.unit : (item?.unit ?? '');

  return (
    <ActionForm
      action={action}
      className="flex flex-col gap-4"
      resetOnSuccess
      onSuccess={() => {
        setQuantity('');
        setCost('');
      }}
    >
      <fieldset className="flex gap-1 rounded-[10px] bg-sheet-head p-1 text-sm">
        <legend className="sr-only">Tipo de movimiento</legend>
        {(['adjustment', 'transfer'] as const).map((k) => (
          <label key={k} className={`flex-1 cursor-pointer rounded px-3 py-1.5 text-center ${kind === k ? 'bg-sheet font-semibold shadow-sm' : 'text-ink-2'}`}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {k === 'adjustment' ? 'Ajuste de inventario' : 'Traspaso'}
          </label>
        ))}
      </fieldset>
      <SelectField
        label="Artículo"
        name="itemId"
        options={items}
        placeholder="Elige…"
        required
        value={itemId}
        onChange={(e) => {
          setItemId(e.target.value);
          setInPacks(Boolean(items.find((i) => i.value === e.target.value)?.pack));
        }}
      />
      <SelectField label={kind === 'transfer' ? 'Desde' : 'Almacén'} name="warehouseId" options={warehouses} defaultValue={warehouses[0]?.value} />
      {kind === 'transfer' && <SelectField label="Hacia" name="toWarehouseId" options={warehouses} placeholder="Elige…" />}

      {/* Lo que viaja al servidor, ya en unidades de stock. */}
      <input type="hidden" name="quantity" value={valid ? String(num(quantity) * factor) : quantity} />
      <input type="hidden" name="unitCost" value={cost.trim() === '' ? '' : String(Number((num(cost) / factor).toFixed(6)))} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="adj-qty" className="text-xs font-semibold text-ink-3">Cantidad{shownUnit ? ` (${shownUnit})` : ''}</label>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <input id="adj-qty" inputMode="decimal" required value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
          </div>
          {item?.pack && (
            <div className="w-36 shrink-0">
              <select aria-label="Unidad de la cantidad" value={inPacks ? 'pack' : 'unit'} onChange={(e) => setInPacks(e.target.value === 'pack')} className={inputClass}>
                <option value="pack">{item.pack.unit} de {fmt(num(item.pack.size))}</option>
                <option value="unit">{item.unit}</option>
              </select>
            </div>
          )}
        </div>
        <p className="text-xs text-ink-3">
          {inPacks && item?.pack && valid
            ? <span className="font-medium text-ok">= {fmt(num(quantity) * factor)} {item.unit} en stock</span>
            : kind === 'adjustment' ? 'Positiva si sobra o entra mercancía, negativa si falta (rotura, merma)' : 'Cantidad que cambia de almacén'}
        </p>
      </div>
      {kind === 'adjustment' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="adj-cost" className="text-xs font-semibold text-ink-3">Coste{shownUnit ? ` por ${shownUnit}` : ' unitario'}</label>
          <input id="adj-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} />
          <p className="text-xs text-ink-3">Solo para entradas; vacío = coste medio actual</p>
        </div>
      )}
      <TextField label="Motivo" name="note" required placeholder={kind === 'adjustment' ? 'Recuento de inventario de octubre' : 'Reposición de Nave 2'} />
      <div>
        <SubmitButton pendingLabel="Registrando…">{kind === 'adjustment' ? 'Registrar ajuste' : 'Registrar traspaso'}</SubmitButton>
      </div>
    </ActionForm>
  );
}
