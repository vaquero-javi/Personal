'use client';

import { ActionForm, SelectField, TextAreaField, TextField, type FormAction } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { LineItems, type ItemOption } from '@/components/ui/line-items';

export function PurchaseOrderForm({
  action,
  suppliers,
  warehouses,
  items,
}: {
  action: FormAction;
  suppliers: { value: string; label: string }[];
  warehouses: { value: string; label: string }[];
  items: ItemOption[];
}) {
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-4">
        <SelectField label="Proveedor" name="supplierId" options={suppliers} placeholder="Elige…" required className="md:col-span-2" />
        <SelectField label="Entregar en" name="warehouseId" options={warehouses} defaultValue={warehouses[0]?.value} />
        <TextField label="Entrega prevista" name="expectedOn" type="date" />
      </div>
      <LineItems items={items} mode="cost" />
      <TextAreaField label="Notas para el proveedor" name="notes" rows={2} />
      <div>
        <SubmitButton pendingLabel="Guardando…">Guardar pedido</SubmitButton>
      </div>
    </ActionForm>
  );
}
