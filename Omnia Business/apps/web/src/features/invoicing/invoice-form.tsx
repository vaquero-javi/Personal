'use client';

import { ActionForm, SelectField, TextField, type FormAction } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { LineItems, type ItemOption, type LineDraft } from '@/components/ui/line-items';

export interface InvoiceInitial {
  partyId?: string;
  supplierNumber?: string;
  warehouseId?: string;
  issueDate?: string;
  lines?: LineDraft[];
}

export function InvoiceForm({
  action,
  direction,
  parties,
  items,
  warehouses = [],
  initial,
}: {
  action: FormAction;
  direction: 'issued' | 'received';
  parties: { value: string; label: string }[];
  items: ItemOption[];
  /** Recibidas: almacenes donde puede entrar la mercancía (el primero, por defecto). */
  warehouses?: { value: string; label: string }[];
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
      <LineItems items={items} mode="price" allowFreeText packs={direction === 'received'} {...(initial?.lines ? { initial: initial.lines } : {})} />
      {direction === 'received' && (
        <div className="grid gap-4 md:grid-cols-4">
          {warehouses.length > 0 && (
            <SelectField
              label="Entra en el almacén"
              name="warehouseId"
              options={warehouses}
              defaultValue={initial?.warehouseId ?? warehouses[0]!.value}
              hint="Los artículos de almacén de la factura se suman a su stock al registrarla."
              className="md:col-span-2"
            />
          )}
          <TextField label="Vencimiento" name="dueDate" type="date" hint="Vacío = según el plazo del proveedor" />
        </div>
      )}
      <div>
        <SubmitButton pendingLabel="Guardando…">{direction === 'issued' ? 'Guardar borrador' : 'Registrar factura'}</SubmitButton>
      </div>
    </ActionForm>
  );
}
