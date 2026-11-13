import Link from 'next/link';
import { Store, X } from 'lucide-react';
import { Badge, Cell, EmptyState, PageHeader, Ruled } from '@/components/ui/layout';
import { ActionForm, CheckboxField, SelectField, TextField } from '@/components/ui/form';
import { Button, SubmitButton } from '@/components/ui/button';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { deleteEstablishment, saveEstablishment, setEstablishmentMember } from '../actions';

export const metadata = { title: 'Empresas · Omnia' };

/**
 * Empresas = negocios o locales DE esta sociedad: comparten su NIF y su
 * facturación, y cada una tiene sus almacenes (y, con ellos, su TPV).
 */
export default async function EstablishmentsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { ctx, can, org } = await requireOrg(slug);

  if (org.kind === 'holding') {
    return (
      <>
        <PageHeader title="Empresas" />
        <Cell>
          <EmptyState title="Las empresas van dentro de cada sociedad">
            Un holding agrupa sociedades; los negocios o locales se crean dentro de la sociedad que los explota, en sus Ajustes › Empresas.
          </EmptyState>
        </Cell>
      </>
    );
  }

  const [establishments, members] = await Promise.all([
    container().organizations.establishments(ctx),
    can('members.read') ? container().organizations.members(ctx) : Promise.resolve([]),
  ]);
  const editable = can('org.manage');
  const staffEditable = can('members.manage');
  const active = members.filter((m) => m.status === 'active');
  const name = org.tradeName ?? org.legalName;

  return (
    <>
      <PageHeader
        title="Empresas"
        description={`Negocios o locales de ${name}. Comparten su NIF y su facturación; cada uno tiene sus almacenes (y con ellos su TPV), su personal y sus turnos.`}
      />
      <Ruled cols="lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell>
          {establishments.length === 0 ? (
            <EmptyState title="Aún no hay empresas">
              Crea una por cada negocio o local (p. ej. «Bar La Plaza» y «Cafetería Centro») y después asígnale sus almacenes en Almacén › Almacenes.
            </EmptyState>
          ) : (
            <ul className="-my-1 divide-y divide-line-soft">
              {establishments.map((e) => (
                <li key={e.id} className="flex flex-col gap-3 py-3.5">
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-fill text-ink-2">
                      <Store className="size-[18px]" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
                        {e.name}
                        {!e.isActive && <Badge tone="muted">Inactiva</Badge>}
                      </p>
                      <p className="text-[13px] text-ink-3">
                        {e.warehouseCount === 0 ? (
                          <>
                            Sin almacenes.{' '}
                            <Link href={`/o/${slug}/almacen/almacenes`} className="text-tint hover:underline">Asignar en Almacenes</Link>
                          </>
                        ) : (
                          `${e.warehouseCount === 1 ? 'Almacén' : 'Almacenes'}: ${e.warehouseNames.join(', ')}`
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="pl-12">
                    <p className="mb-1.5 text-[13px] font-medium text-ink-2">Personal</p>
                    <ul className="flex flex-wrap items-center gap-1.5">
                      {e.memberIds.length === 0 && <li className="text-[13px] text-ink-3">Nadie asignado todavía.</li>}
                      {e.memberIds.map((id, i) => (
                        <li key={id} className="flex items-center gap-1 rounded-full bg-fill py-0.5 pr-1 pl-2.5 text-[13px]">
                          {e.memberNames[i]}
                          {staffEditable && (
                            <ActionForm action={setEstablishmentMember.bind(null, slug, e.id, id, false)}>
                              <button type="submit" aria-label={`Quitar a ${e.memberNames[i]} de ${e.name}`} className="flex size-5 items-center justify-center rounded-full text-ink-3 hover:bg-fill-strong hover:text-danger">
                                <X aria-hidden className="size-3.5" />
                              </button>
                            </ActionForm>
                          )}
                        </li>
                      ))}
                    </ul>
                    {staffEditable && active.some((m) => !e.memberIds.includes(m.userId)) && (
                      <ActionForm action={setEstablishmentMember.bind(null, slug, e.id, '', true)} className="mt-2 flex items-end gap-2" resetOnSuccess>
                        <SelectField
                          label={`Añadir persona a ${e.name}`}
                          name="userId"
                          placeholder="Elige…"
                          required
                          options={active.filter((m) => !e.memberIds.includes(m.userId)).map((m) => ({ value: m.userId, label: m.fullName ?? m.email }))}
                          className="max-w-xs flex-1"
                        />
                        <SubmitButton variant="secondary">Añadir</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                  {editable && (
                    <div className="flex flex-col gap-2 pl-12 sm:flex-row sm:items-end">
                      <ActionForm action={saveEstablishment.bind(null, slug)} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                        <input type="hidden" name="id" value={e.id} />
                        <TextField label="Nombre" name="name" defaultValue={e.name} required maxLength={80} className="sm:max-w-xs sm:flex-1" />
                        <div className="sm:pb-2">
                          <CheckboxField label="Activa" name="isActive" defaultChecked={e.isActive} />
                        </div>
                        <div>
                          <SubmitButton>Guardar</SubmitButton>
                        </div>
                      </ActionForm>
                      <ActionForm
                        action={deleteEstablishment.bind(null, slug, e.id)}
                        confirm={`¿Eliminar «${e.name}»? Sus almacenes, su stock y su TPV se quedan en la sociedad, sin empresa.`}
                      >
                        <Button type="submit" variant="danger">Eliminar</Button>
                      </ActionForm>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Cell>
        <Cell title="Nueva empresa">
          {editable ? (
            <ActionForm action={saveEstablishment.bind(null, slug)} className="flex flex-col gap-4" resetOnSuccess>
              <TextField label="Nombre" name="name" required maxLength={80} placeholder="Cafetería Centro" hint="El nombre del negocio o local" />
              <div>
                <SubmitButton>Crear empresa</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-ink-2">Crear empresas requiere el permiso de gestión de la sociedad.</p>
          )}
        </Cell>
      </Ruled>
    </>
  );
}
