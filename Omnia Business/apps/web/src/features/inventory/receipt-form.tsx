'use client';

import { Paperclip } from 'lucide-react';
import { ActionForm, SelectField, TextAreaField, TextField, type FormAction } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { CustomFieldInputs, type CustomFieldDef } from '@/components/ui/custom-fields';
import { LineErrors, LineItems, type ItemOption, type LineDraft } from '@/components/ui/line-items';

export interface ReceiptInitial {
  supplierId?: string;
  supplierDeliveryNote?: string;
  notes?: string;
  lines?: LineDraft[];
}

export function ReceiptForm({
  action,
  suppliers,
  warehouses,
  items,
  customFields,
  initial = {},
  photo,
  accept,
}: {
  action: FormAction;
  suppliers: { value: string; label: string }[];
  warehouses: { value: string; label: string }[];
  items: ItemOption[];
  customFields: CustomFieldDef[];
  /** Datos leídos de una foto del albarán, para revisar antes de guardar. */
  initial?: ReceiptInitial;
  /** Foto ya escaneada: se guarda con el albarán sin volver a elegirla. */
  photo?: File | null;
  /** Tipos admitidos para adjuntar la foto a mano. */
  accept: string;
}) {
  const submit: FormAction = photo
    ? (state, formData) => {
        formData.set('photo', photo);
        return action(state, formData);
      }
    : action;
  return (
    <ActionForm action={submit} className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-4">
        <SelectField label="Proveedor" name="supplierId" options={suppliers} placeholder="Elige…" required defaultValue={initial.supplierId ?? ''} className="md:col-span-2" />
        <SelectField label="Almacén" name="warehouseId" options={warehouses} defaultValue={warehouses[0]?.value} />
        <TextField label="Nº de albarán del proveedor" name="supplierDeliveryNote" required defaultValue={initial.supplierDeliveryNote ?? ''} />
      </div>
      <div>
        <LineItems items={items} mode="cost" initial={initial.lines ?? []} />
        <LineErrors />
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <TextField label="Fecha de recepción" name="receivedAt" type="datetime-local" hint="Vacío = ahora" />
        <TextAreaField label="Notas" name="notes" rows={2} defaultValue={initial.notes ?? ''} />
      </div>
      {photo ? (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <Paperclip aria-hidden className="size-4 shrink-0 text-ink-3" />
          <span>
            La foto <span className="font-medium text-ink">{photo.name}</span> se guardará con el albarán.
          </span>
        </p>
      ) : (
        <TextField label="Foto o PDF del albarán" name="photo" type="file" accept={accept} hint="Opcional · se guarda como justificante, hasta 7 MB" className="max-w-md" />
      )}
      <CustomFieldInputs definitions={customFields} />
      <div>
        <SubmitButton pendingLabel="Guardando…">Guardar borrador</SubmitButton>
      </div>
    </ActionForm>
  );
}
