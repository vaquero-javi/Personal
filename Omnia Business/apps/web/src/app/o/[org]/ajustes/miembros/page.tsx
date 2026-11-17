import { Cell, PageHeader, Ruled, StatusBadge } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, SelectField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { Trash2 } from 'lucide-react';
import { addMember, removeMember, resendInvitation, updateMember } from '../actions';

export const metadata = { title: 'Miembros · Omnia' };

const STATUS = { active: ['Activo', 'ok'], suspended: ['Suspendido', 'muted'], invited: ['Invitado', 'info'] } as const;

export default async function MembersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can } = await requireOrg(org);
  const [members, roles] = await Promise.all([container().organizations.members(ctx), container().organizations.roles(ctx)]);
  const manage = can('members.manage');
  const roleOptions = roles.map((r) => ({ value: r.id, label: r.name }));
  return (
    <>
      <PageHeader title="Miembros" description="Quién trabaja en esta sociedad y con qué rol. Cada persona puede tener un rol distinto en cada sociedad." />
      <Ruled cols={manage ? 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}>
        <Cell>
          <Table minWidth={720}>
            <thead>
              <tr>
                <Th>Persona</Th>
                {!manage && <Th>Código</Th>}
                <Th>{manage ? 'Código, rol y estado' : 'Rol'}</Th>
                {!manage && <Th>Estado</Th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <Tr key={m.userId}>
                  <Td>
                    <span className="font-medium">{m.fullName ?? m.email}</span>
                    <span className="block text-xs text-ink-3">{m.email}</span>
                  </Td>
                  {!manage && <Td className="text-ink-2">{m.employeeCode ?? '—'}</Td>}
                  {manage ? (
                    <Td>
                      {m.roleKey === 'owner' && !can('*') ? (
                        <span className="text-sm">
                          {m.employeeCode && <span className="mr-2 text-ink-2">{m.employeeCode}</span>}
                          {m.roleName}
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-end gap-2">
                          <ActionForm action={updateMember.bind(null, org, m.userId)} className="flex flex-wrap items-end gap-2">
                            <input
                              name="employeeCode"
                              defaultValue={m.employeeCode ?? ''}
                              maxLength={30}
                              placeholder="Código"
                              aria-label={`Código de empleado de ${m.fullName ?? m.email}`}
                              className="h-8 w-24 rounded-lg bg-fill px-2 text-sm"
                            />
                            <select name="roleId" defaultValue={m.roleId} aria-label={`Rol de ${m.fullName}`} className="h-8 rounded-lg bg-fill px-2 text-sm">
                              {roleOptions.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                            {m.status === 'invited' ? (
                              <span className="flex h-8 items-center"><StatusBadge map={STATUS} value={m.status} /></span>
                            ) : (
                              <select name="status" defaultValue={m.status} aria-label={`Estado de ${m.fullName}`} className="h-8 rounded-lg bg-fill px-2 text-sm">
                                <option value="active">Activo</option>
                                <option value="suspended">Suspendido</option>
                              </select>
                            )}
                            <SubmitButton variant="secondary" className="h-8 px-3">Guardar</SubmitButton>
                          </ActionForm>
                          {/* Solo el propietario, y solo a quien ya está suspendido. */}
                          {m.status === 'suspended' && can('*') && m.userId !== ctx.userId && (
                            <ActionForm
                              action={removeMember.bind(null, org, m.userId)}
                              confirm={`¿Borrar a ${m.fullName ?? m.email} de esta sociedad? Perderá el acceso y no se puede deshacer.`}
                            >
                              <SubmitButton variant="danger" className="h-8 px-3" pendingLabel="Borrando…">
                                <Trash2 aria-hidden className="size-4" />
                                Borrar
                              </SubmitButton>
                            </ActionForm>
                          )}
                        </div>
                      )}
                      {m.status === 'invited' && (
                        <ActionForm action={resendInvitation.bind(null, org, m.userId)} className="mt-2">
                          <SubmitButton variant="secondary" className="h-8 px-3" pendingLabel="Enviando…">Reenviar invitación</SubmitButton>
                        </ActionForm>
                      )}
                    </Td>
                  ) : (
                    <>
                      <Td>{m.roleName}</Td>
                      <Td><StatusBadge map={STATUS} value={m.status} /></Td>
                    </>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        </Cell>
        {manage && (
          <Cell title="Añadir miembro">
            <ActionForm action={addMember.bind(null, org)} className="flex flex-col gap-3" resetOnSuccess>
              <p className="text-sm text-ink-2">Le enviaremos un correo para que active su acceso poniendo una contraseña. Si ya usa Omnia, le avisaremos y verá esta sociedad al entrar.</p>
              <TextField label="Nombre" name="firstName" autoComplete="off" required />
              <TextField label="Apellidos" name="lastName" autoComplete="off" required />
              <TextField label="Email" name="email" type="email" required />
              <SelectField label="Rol" name="roleId" options={roleOptions} defaultValue={roles.find((r) => r.key === 'employee')?.id} />
              <TextField label="Código de empleado" name="employeeCode" placeholder="Opcional, p. ej. el de la gestoría" maxLength={30} />
              <div>
                <SubmitButton>Añadir</SubmitButton>
              </div>
            </ActionForm>
          </Cell>
        )}
      </Ruled>
    </>
  );
}
