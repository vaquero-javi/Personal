'use client';

import { ActionForm, SelectField, TextField, type FormAction } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { LineItems, type ItemOption, type LineDraft } from '@/components/ui/line-items';

export interface InvoiceInitial {
  partyId?: string;
  supplierNumber?: string;
  issueDate?: string;
  lines?: LineDraft[];
}

export function InvoiceForm({
  action,
  direction,
  parties,
  items,
  initial,
}: {
  action: FormAction;
  direction: 'issued' | 'received';
  parties: { value: string; label: string }[];
  items: ItemOption[];
  /** Datos con que empieza el formulario (p. ej. leídos de una foto). */
  initial?: InvoiceInitial;
}) {
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-4">
        <SelectField label={direction === 'issued' ? 'Cliente' : 'Proveedor'} name="partyId" options={parties} placeholder="Elige…" required className="md:col-span-2" defaultValue={initial?.partyId ?? ''} />
        {direction === 'received' ? (
          <>
            <TextField label="Nº de factura del proveedor" name="supplierNumber" required defaultValue={initial?.supplierNumber ?? ''} />
            <TextField label="Fecha de la factura" name="issueDate" type="date" required defaultValue={initial?.issueDate ?? ''} />
          </>
        ) : (
          <TextField label="Vencimiento" name="dueDate" type="date" hint="Vacío = según el plazo del cliente" />
        )}
      </div>
      <LineItems items={items} mode="price" allowFreeText {...(initial?.lines ? { initial: initial.lines } : {})} />
      {direction === 'received' && <TextField label="Vencimiento" name="dueDate" type="date" hint="Vacío = según el plazo del proveedor" className="max-w-56" />}
      <div>
        <SubmitButton pendingLabel="Guardando…">{direction === 'issued' ? 'Guardar borrador' : 'Registrar factura'}</SubmitButton>
      </div>
    </ActionForm>
  );
}
