import { Cell, PageHeader } from '@/components/ui/layout';
import { ActionForm, SelectField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { spineClasses } from '@/components/shell/spines';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { updateOrganization } from './actions';

export const metadata = { title: 'Ajustes · Omnia' };

const REGIMES = [
  { value: 'verifactu', label: 'VeriFactu (AEAT)' },
  { value: 'ticketbai_araba', label: 'TicketBAI · Álava' },
  { value: 'ticketbai_bizkaia', label: 'TicketBAI · Bizkaia' },
  { value: 'ticketbai_gipuzkoa', label: 'TicketBAI · Gipuzkoa' },
  { value: 'sii', label: 'SII (grandes empresas)' },
  { value: 'none', label: 'Sin sistema de facturación verificable' },
];
const COLORS = [
  { value: 'red', label: 'Rojo' },
  { value: 'blue', label: 'Azul' },
  { value: 'yellow', label: 'Amarillo' },
  { value: 'green', label: 'Verde' },
] as const;

export default async function SettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { ctx, can } = await requireOrg(slug);
  const org = await container().organizations.get(ctx);
  const editable = can('org.manage');
  return (
    <>
      <PageHeader title="Datos de la sociedad" description="Datos fiscales que aparecen en facturas y en los registros VeriFactu." />
      <Cell>
        <ActionForm action={updateOrganization.bind(null, slug)} className="flex max-w-3xl flex-col gap-4">
          <fieldset disabled={!editable} className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
              <TextField label="Razón social" name="legalName" required defaultValue={org.legalName} />
              <TextField label="NIF" name="taxId" required defaultValue={org.taxId} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Nombre comercial" name="tradeName" defaultValue={org.tradeName ?? ''} hint="Es el que aparece en el lomo del archivador" />
              <SelectField label="Sistema de facturación" name="fiscalRegime" defaultValue={org.fiscalRegime} options={REGIMES} />
            </div>
            <fieldset className="flex flex-col gap-4 border-t border-line-soft pt-4">
              <legend className="sr-only">Domicilio fiscal y cobros</legend>
              <p className="text-sm font-bold">Domicilio fiscal y cobros</p>
              <p className="-mt-2 text-sm text-ink-3">Obligatorio en las facturas. Se congela en cada factura al emitirla.</p>
              <TextField label="Dirección" name="addressLine" defaultValue={org.fiscalAddress.line ?? ''} placeholder="Calle, número, piso" />
              <div className="grid gap-4 md:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]">
                <TextField label="Código postal" name="postalCode" inputMode="numeric" defaultValue={org.fiscalAddress.postalCode ?? ''} />
                <TextField label="Municipio" name="city" defaultValue={org.fiscalAddress.city ?? ''} />
                <TextField label="Provincia" name="province" defaultValue={org.fiscalAddress.province ?? ''} />
              </div>
              <TextField label="IBAN para transferencias" name="iban" defaultValue={org.iban?.replace(/(.{4})/g, '$1 ').trim() ?? ''} hint="Aparece en las facturas que se cobran por transferencia" className="max-w-md" />
            </fieldset>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-xs font-semibold text-ink-3">Color del lomo</legend>
              <div className="flex flex-wrap gap-4">
                {COLORS.map((c) => (
                  <label key={c.value} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="radio" name="spineColor" value={c.value} defaultChecked={org.spineColor === c.value} className="peer sr-only" />
                    <span aria-hidden className={`size-6 rounded ring-offset-2 peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ink ${spineClasses[c.value].bg}`} />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-sm text-ink-3">
              Dirección en la app: <code>/o/{org.slug}</code>
            </p>
          </fieldset>
          {editable ? (
            <div>
              <SubmitButton>Guardar</SubmitButton>
            </div>
          ) : (
            <p className="text-sm text-ink-2">Solo lectura: editar estos datos requiere el permiso de gestión de la sociedad.</p>
          )}
        </ActionForm>
      </Cell>
    </>
  );
}
