import { Trash2 } from 'lucide-react';
import { Badge, Cell, PageHeader } from '@/components/ui/layout';
import { ActionForm, SelectField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { deleteRole, saveRole } from '../actions';
import type { Permission, Role } from '@omnia/organizations/types';

export const metadata = { title: 'Roles y permisos · Omnia' };

const MODULE_LABEL: Record<string, string> = {
  org: 'Sociedad', members: 'Miembros', roles: 'Roles', audit: 'Auditoría', parties: 'Clientes y proveedores', inventory: 'Almacén',
  invoicing: 'Facturación', purchasing: 'Compras', sales: 'Ventas', hr: 'RRHH', incidents: 'Incidencias', tasks: 'Tareas', stats: 'Estadísticas',
};

function PermissionGrid({ catalog, selected, disabled }: { catalog: Permission[]; selected: string[]; disabled?: boolean }) {
  const modules = [...new Set(catalog.map((p) => p.module))];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))]">
      {modules.map((m) => (
        <fieldset key={m} className="min-w-0 rounded-xl bg-fill/50 px-4 py-3" disabled={disabled}>
          <legend className="sr-only">{MODULE_LABEL[m] ?? m}</legend>
          <p aria-hidden className="mb-1.5 text-xs font-semibold text-ink-3">{MODULE_LABEL[m] ?? m}</p>
          {catalog
            .filter((p) => p.module === m)
            .map((p) => (
              <label key={p.code} className="flex items-start gap-2 py-1 text-sm">
                <input type="checkbox" name="permissions" value={p.code} defaultChecked={selected.includes(p.code)} className="mt-0.5 size-4 shrink-0 accent-tint" />
                <span>
                  {p.description}
                  <code className="ml-1 text-xs text-ink-3">{p.code}</code>
                </span>
              </label>
            ))}
        </fieldset>
      ))}
    </div>
  );
}

export default async function RolesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can } = await requireOrg(org);
  const [roles, catalog] = await Promise.all([container().organizations.roles(ctx), container().organizations.permissionCatalog(ctx)]);
  const manage = can('roles.manage');
  const remove = can('roles.delete');
  const moveMembers = can('members.manage');
  return (
    <>
      <PageHeader title="Roles y permisos" description="Los permisos se comprueban en la propia base de datos, no solo en pantalla: aunque alguien manipule la app, no verá ni tocará lo que su rol no permite. «módulo.*» concede todo el módulo." />
      {roles.map((r) => (
        <Cell
          key={r.id}
          title={
            <span className="flex items-center gap-2">
              {r.name} <span className="text-xs font-normal text-ink-3">{r.memberCount} {r.memberCount === 1 ? 'persona' : 'personas'}</span>
              {r.isSystem && <Badge tone="muted">Rol de sistema</Badge>}
            </span>
          }
        >
          {r.isSystem ? (
            <p className="text-sm text-ink-2">Acceso total. No se puede modificar para que siempre haya alguien capaz de administrar la sociedad.</p>
          ) : (
            <ActionForm action={saveRole.bind(null, org, r.id)} className="flex flex-col gap-4">
              <TextField label="Nombre" name="name" defaultValue={r.name} required disabled={!manage} className="max-w-sm" />
              <PermissionGrid catalog={catalog} selected={r.permissions} disabled={!manage} />
              {manage && (
                <div>
                  <SubmitButton variant="secondary">Guardar rol</SubmitButton>
                </div>
              )}
            </ActionForm>
          )}
          {remove && !r.isSystem && <DeleteRole org={org} role={r} others={roles.filter((o) => o.id !== r.id && !o.isSystem)} moveMembers={moveMembers} />}
        </Cell>
      ))}
      {manage && (
        <Cell title="Nuevo rol">
          <ActionForm action={saveRole.bind(null, org, null)} className="flex flex-col gap-4" resetOnSuccess>
            <TextField label="Nombre" name="name" required placeholder="Mozo de almacén" className="max-w-sm" />
            <PermissionGrid catalog={catalog} selected={[]} />
            <div>
              <SubmitButton>Crear rol</SubmitButton>
            </div>
          </ActionForm>
        </Cell>
      )}
    </>
  );
}

/**
 * Eliminar un rol (permiso «Eliminar roles»). Si alguien lo tiene, se elige a
 * qué rol pasa; mover personas de rol exige además poder cambiar roles de miembros.
 */
function DeleteRole({ org, role, others, moveMembers }: { org: string; role: Role; others: Role[]; moveMembers: boolean }) {
  const people = role.memberCount === 1 ? '1 persona' : `${role.memberCount} personas`;
  return (
    <div className="mt-5 border-t border-line-soft pt-4">
      {role.memberCount === 0 ? (
        <ActionForm action={deleteRole.bind(null, org, role.id)} confirm={`¿Eliminar el rol «${role.name}»? Se borran sus permisos y no se puede deshacer.`}>
          <SubmitButton variant="danger" pendingLabel="Eliminando…">
            <Trash2 aria-hidden className="size-4" />
            Eliminar rol
          </SubmitButton>
        </ActionForm>
      ) : !moveMembers ? (
        <p className="text-[13px] text-ink-3">
          Este rol lo tiene{role.memberCount === 1 ? '' : 'n'} {people}. Para eliminarlo hay que pasarlas a otro rol, y para eso tu rol necesita también «Invitar, suspender y cambiar roles».
        </p>
      ) : others.length === 0 ? (
        <p className="text-[13px] text-ink-3">Este rol lo tiene{role.memberCount === 1 ? '' : 'n'} {people}. Crea antes otro rol al que pasarlas para poder eliminarlo.</p>
      ) : (
        <ActionForm
          action={deleteRole.bind(null, org, role.id)}
          confirm={`¿Eliminar el rol «${role.name}»? ${role.memberCount === 1 ? 'La persona que lo tiene pasará' : `Las ${role.memberCount} personas que lo tienen pasarán`} al rol elegido. No se puede deshacer.`}
          className="flex flex-wrap items-end gap-3"
        >
          <SelectField
            label={role.memberCount === 1 ? '¿A qué rol pasa la persona que lo tiene?' : `¿A qué rol pasan sus ${people}?`}
            name="replacementId"
            required
            placeholder="Elige un rol…"
            options={others.map((o) => ({ value: o.id, label: o.name }))}
            className="w-72"
          />
          <SubmitButton variant="danger" pendingLabel="Eliminando…">
            <Trash2 aria-hidden className="size-4" />
            Eliminar rol
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
