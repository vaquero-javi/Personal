import Link from 'next/link';
import { hasPermission } from '@omnia/organizations';
import { Cell, PageHeader } from '@/components/ui/layout';
import { ActionForm, SelectField, TextField } from '@/components/ui/form';
import { LinkButton, SubmitButton } from '@/components/ui/button';
import { SpineColorPicker } from '@/features/organizations/spine-color-picker';
import { container } from '@/server/container';
import { myMemberships, requireOrg } from '@/server/session';
import { setOrganizationParent, updateOrganization } from './actions';

export const metadata = { title: 'Ajustes · Omnia' };

const REGIMES = [
  { value: 'verifactu', label: 'VeriFactu (AEAT)' },
  { value: 'ticketbai_araba', label: 'TicketBAI · Álava' },
  { value: 'ticketbai_bizkaia', label: 'TicketBAI · Bizkaia' },
  { value: 'ticketbai_gipuzkoa', label: 'TicketBAI · Gipuzkoa' },
  { value: 'sii', label: 'SII (grandes empresas)' },
  { value: 'none', label: 'Sin sistema de facturación verificable' },
];

export default async function SettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { ctx, can } = await requireOrg(slug);
  const [org, memberships] = await Promise.all([container().organizations.get(ctx), myMemberships()]);
  const editable = can('org.manage');
  const label = (m: { tradeName: string | null; legalName: string }) => m.tradeName ?? m.legalName;
  // Holdings a los que se puede mover: los que gestionas (y el actual, aunque no lo gestiones, para mostrarlo).
  const holdings = memberships.filter((m) => m.kind === 'holding' && (hasPermission(m.permissions, 'org.manage') || m.organizationId === org.parentId));
  const children = memberships.filter((m) => m.parentId === org.id);
  return (
    <>
      <PageHeader
        title={org.kind === 'holding' ? 'Datos del holding' : 'Datos de la sociedad'}
        description="Datos fiscales que aparecen en facturas y en los registros VeriFactu."
      />
      {org.kind === 'holding' ? (
        <Cell title="Sociedades del grupo" actions={editable && <LinkButton href={`/o/nueva?holding=${org.id}`}>Nueva sociedad</LinkButton>}>
          {children.length === 0 ? (
            <p className="text-[14px] text-ink-3">
              Aún no hay sociedades en este holding. Crea una nueva o, desde los ajustes de una sociedad que ya tengas, elige este holding.
            </p>
          ) : (
            <ul className="-my-1 divide-y divide-line-soft text-[15px]">
              {children.map((c) => (
                <li key={c.organizationId} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/o/${c.slug}/ajustes`} className="font-medium hover:underline">{label(c)}</Link>
                  <span className="text-[13px] text-ink-3">{c.taxId}</span>
                </li>
              ))}
            </ul>
          )}
        </Cell>
      ) : (
        <Cell title="Grupo">
          {editable && holdings.length > 0 ? (
            <ActionForm action={setOrganizationParent.bind(null, slug)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <SelectField
                label="Pertenece al holding"
                name="parentId"
                defaultValue={org.parentId ?? ''}
                placeholder="Ninguno (sociedad independiente)"
                options={holdings.map((h) => ({ value: h.organizationId, label: label(h) }))}
                className="sm:max-w-sm sm:flex-1"
              />
              <div>
                <SubmitButton>Guardar</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="text-[14px] text-ink-3">
              {org.parentId
                ? `Pertenece al holding ${label(holdings.find((h) => h.organizationId === org.parentId) ?? { tradeName: null, legalName: 'del grupo' })}.`
                : 'Sociedad independiente.'}{' '}
              {editable && 'Para agruparla, crea un holding desde «+» en la barra lateral y elígelo aquí.'}
            </p>
          )}
        </Cell>
      )}
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
              <SpineColorPicker name="spineColor" defaultValue={org.spineColor} />
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
