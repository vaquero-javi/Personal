'use client';

import { ActionForm, CheckboxField, SelectField, TextField, type FormAction } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { CustomFieldInputs, type CustomFieldDef } from '@/components/ui/custom-fields';
import type { Item } from '@omnia/inventory/contracts-items';

export function ItemForm({ action, item, customFields }: { action: FormAction; item?: Item; customFields: CustomFieldDef[] }) {
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <TextField label="Referencia (SKU)" name="sku" required defaultValue={item?.sku} />
        <TextField label="Nombre" name="name" required defaultValue={item?.name} />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <SelectField
          label="Tipo"
          name="itemType"
          defaultValue={item?.itemType ?? 'stockable'}
          options={[
            { value: 'stockable', label: 'Inventariable' },
            { value: 'consumable', label: 'Consumible' },
            { value: 'service', label: 'Servicio' },
          ]}
          hint="Solo los inventariables llevan stock"
        />
        <TextField label="Unidad" name="unitOfMeasure" required defaultValue={item?.unitOfMeasure ?? 'ud'} />
        <TextField label="IVA por defecto (%)" name="defaultTaxRate" inputMode="decimal" required defaultValue={item ? Number(item.defaultTaxRate).toString() : '21'} />
        <TextField label="Código de barras" name="barcode" defaultValue={item?.barcode ?? ''} />
      </div>
      {item && <CheckboxField label="Activo (aparece en ventas, compras y TPV)" name="isActive" defaultChecked={item.isActive} />}
      <CustomFieldInputs definitions={customFields} initial={item?.customFields ?? {}} />
      <div>
        <SubmitButton pendingLabel="Guardando…">{item ? 'Guardar cambios' : 'Crear artículo'}</SubmitButton>
      </div>
    </ActionForm>
  );
}
