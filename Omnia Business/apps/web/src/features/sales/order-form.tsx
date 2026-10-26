'use client';

import { useState } from 'react';
import { ActionForm, SelectField, TextAreaField, inputClass, Field, type FormAction } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { LineItems, type ItemOption } from '@/components/ui/line-items';

export function SalesOrderForm({
  action,
  customers,
  warehouses,
  items,
  priceByList,
  defaultList,
}: {
  action: FormAction;
  customers: { value: string; label: string; priceListId: string }[];
  warehouses: { value: string; label: string }[];
  items: Omit<ItemOption, 'suggested'>[];
  priceByList: Record<string, Record<string, string>>;
  defaultList: string;
}) {
  const [customerId, setCustomerId] = useState('');
  const list = customers.find((c) => c.value === customerId)?.priceListId ?? defaultList;
  const priced = items.map((i) => ({ ...i, suggested: priceByList[list]?.[i.id] ? Number(priceByList[list][i.id]).toString() : '' }));
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Cliente" name="customerId" className="md:col-span-2">
          {(p) => (
            <select {...p} required value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputClass}>
              <option value="">Elige…</option>
              {customers.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          )}
        </Field>
        <SelectField label="Sale de" name="warehouseId" options={warehouses} defaultValue={warehouses[0]?.value} />
      </div>
      {/* key: al cambiar de cliente se rehacen las líneas con los precios de su tarifa */}
      <LineItems key={list} items={priced} mode="price" />
      <TextAreaField label="Notas" name="notes" rows={2} />
      <div>
        <SubmitButton pendingLabel="Guardando…">Guardar pedido</SubmitButton>
      </div>
    </ActionForm>
  );
}
