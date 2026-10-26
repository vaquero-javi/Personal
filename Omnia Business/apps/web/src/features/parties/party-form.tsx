'use client';

import { ActionForm, CheckboxField, SelectField, TextField, type FormAction } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import type { Party } from '@omnia/parties/types';

export function PartyForm({
  action,
  party,
  role,
  priceLists,
}: {
  action: FormAction;
  party?: Party;
  role: 'customer' | 'supplier';
  priceLists: { value: string; label: string }[];
}) {
  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
        <TextField label="Razón social o nombre" name="legalName" required defaultValue={party?.legalName} />
        <TextField label="NIF / CIF" name="taxId" defaultValue={party?.taxId ?? ''} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <TextField label="Email" name="email" type="email" defaultValue={party?.email ?? ''} />
        <TextField label="Teléfono" name="phone" type="tel" defaultValue={party?.phone ?? ''} />
        <TextField label="Plazo de pago (días)" name="paymentTermsDays" inputMode="numeric" defaultValue={String(party?.paymentTermsDays ?? 30)} />
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,7rem)_minmax(0,1fr)_minmax(0,1fr)]">
        <TextField label="Dirección" name="address" defaultValue={party?.billingAddress.line ?? ''} />
        <TextField label="C. P." name="postalCode" defaultValue={party?.billingAddress.postalCode ?? ''} />
        <TextField label="Localidad" name="city" defaultValue={party?.billingAddress.city ?? ''} />
        <TextField label="Provincia" name="province" defaultValue={party?.billingAddress.province ?? ''} />
      </div>
      <div className="grid items-end gap-4 md:grid-cols-3">
        <SelectField label="Tarifa" name="priceListId" options={priceLists} placeholder="Tarifa por defecto" defaultValue={party?.priceListId ?? ''} hint="Precios que se aplican en sus pedidos" />
        <CheckboxField label="Es cliente" name="isCustomer" defaultChecked={party ? party.isCustomer : role === 'customer'} />
        <CheckboxField label="Es proveedor" name="isSupplier" defaultChecked={party ? party.isSupplier : role === 'supplier'} />
      </div>
      <div>
        <SubmitButton pendingLabel="Guardando…">{party ? 'Guardar cambios' : role === 'customer' ? 'Crear cliente' : 'Crear proveedor'}</SubmitButton>
      </div>
    </ActionForm>
  );
}
