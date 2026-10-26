'use client';

import { ActionForm, SelectField, TextField, type FormAction } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { LineItems, type ItemOption } from '@/components/ui/line-items';

export function InvoiceForm({
  action,
  direction,
  parties,
  items,
}: {
  action: FormAction;
  direction: 'issued' | 'received';
  parties: { value: string; label: string }[];
  items: ItemOption[];
}) {
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-4">
        <SelectField label={direction === 'issued' ? 'Cliente' : 'Proveedor'} name="partyId" options={parties} placeholder="Elige…" required className="md:col-span-2" />
        {direction === 'received' ? (
          <>
            <TextField label="Nº de factura del proveedor" name="supplierNumber" required />
            <TextField label="Fecha de la factura" name="issueDate" type="date" required />
          </>
        ) : (
          <TextField label="Vencimiento" name="dueDate" type="date" hint="Vacío = según el plazo del cliente" />
        )}
      </div>
      <LineItems items={items} mode="price" allowFreeText />
      {direction === 'received' && <TextField label="Vencimiento" name="dueDate" type="date" hint="Vacío = según el plazo del proveedor" className="max-w-56" />}
      <div>
        <SubmitButton pendingLabel="Guardando…">{direction === 'issued' ? 'Guardar borrador' : 'Registrar factura'}</SubmitButton>
      </div>
    </ActionForm>
  );
}
