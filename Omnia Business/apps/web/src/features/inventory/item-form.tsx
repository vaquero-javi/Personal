'use client';

import { useState } from 'react';
import { ActionForm, CheckboxField, SelectField, TextField, type FormAction } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { CustomFieldInputs, type CustomFieldDef } from '@/components/ui/custom-fields';
import type { Item } from '@omnia/inventory/contracts-items';
import { detectPack } from '@/lib/pack-detect';

const fmt = (n: number) => Number(n.toFixed(4)).toString().replace('.', ',');

export function ItemForm({ action, item, customFields }: { action: FormAction; item?: Item; customFields: CustomFieldDef[] }) {
  const [name, setName] = useState(item?.name ?? '');
  const [unit, setUnit] = useState(item?.unitOfMeasure ?? 'ud');
  const [purchaseUnit, setPurchaseUnit] = useState(item?.purchaseUnit ?? '');
  const [packSize, setPackSize] = useState(item?.purchaseUnit ? fmt(Number(item.purchasePackSize)) : '');
  // Si el formato se toca a mano, el nombre deja de rellenarlo.
  const [manual, setManual] = useState(Boolean(item?.purchaseUnit));
  const [detected, setDetected] = useState(false);
  // Un artículo con movimientos no cambia de unidad aquí (está «Cambiar unidad de stock»).
  const unitLocked = Boolean(item);

  const onName = (value: string) => {
    setName(value);
    if (manual) return;
    const pack = detectPack(value);
    setDetected(Boolean(pack));
    setPurchaseUnit(pack?.purchaseUnit ?? '');
    setPackSize(pack ? fmt(pack.size) : '');
    if (pack && !unitLocked) setUnit(pack.stockUnit);
  };
  const size = Number(packSize.replace(',', '.'));

  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <TextField label="Referencia (SKU)" name="sku" required defaultValue={item?.sku} />
        <TextField label="Nombre" name="name" required value={name} onChange={(e) => onName(e.target.value)} placeholder="Agua mineral 50 cl (caja 24)" />
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
        <TextField
          label="Unidad de stock"
          name="unitOfMeasure"
          required
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          hint={unitLocked ? 'Para cambiarla con existencias: «Cambiar unidad de stock»' : 'En la que se vende o se gasta: ud, l, kg'}
        />
        <TextField label="IVA por defecto (%)" name="defaultTaxRate" inputMode="decimal" required defaultValue={item ? Number(item.defaultTaxRate).toString() : '21'} />
        <TextField label="Código de barras" name="barcode" defaultValue={item?.barcode ?? ''} />
      </div>
      <fieldset className="grid gap-4 border-t border-line-soft pt-4 md:grid-cols-[minmax(0,12rem)_minmax(0,10rem)_minmax(0,1fr)] md:items-start">
        <legend className="mb-2 text-sm font-bold">Formato de compra</legend>
        <TextField label="Se compra en" name="purchaseUnit" value={purchaseUnit} onChange={(e) => { setManual(true); setPurchaseUnit(e.target.value); }} placeholder="caja, pack, botella…" />
        <TextField label={`${unit || 'Unidades'} por formato`} name="purchasePackSize" inputMode="decimal" value={packSize} onChange={(e) => { setManual(true); setPackSize(e.target.value); }} placeholder="24" />
        <p className={`text-sm md:pt-6 ${purchaseUnit && size > 1 ? 'font-medium text-ok' : 'text-ink-3'}`}>
          {purchaseUnit && size > 1
            ? `${detected && !manual ? 'Detectado en el nombre: ' : ''}1 ${purchaseUnit} = ${fmt(size)} ${unit}. En albaranes y entradas pones las ${purchaseUnit}s y el stock sube en ${unit}.`
            : 'Opcional. Se rellena solo si el nombre dice «caja 24», «pack de 6» o «24x33cl».'}
        </p>
      </fieldset>
      {item && <CheckboxField label="Activo (aparece en ventas, compras y TPV)" name="isActive" defaultChecked={item.isActive} />}
      <CustomFieldInputs definitions={customFields} initial={item?.customFields ?? {}} />
      <div>
        <SubmitButton pendingLabel="Guardando…">{item ? 'Guardar cambios' : 'Crear artículo'}</SubmitButton>
      </div>
    </ActionForm>
  );
}
