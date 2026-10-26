import { Cell, EmptyState, PageHeader, Ruled } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, CheckboxField, SelectField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { createCustomField, deleteCustomField } from '../actions';

export const metadata = { title: 'Campos personalizados · Omnia' };

const ENTITY: Record<string, string> = {
  inventory_item: 'Artículo', party: 'Cliente/proveedor', invoice: 'Factura', goods_receipt: 'Albarán', incident: 'Incidencia', time_entry: 'Fichaje',
};
const TYPE: Record<string, string> = { text: 'Texto', number: 'Número', boolean: 'Sí/No', date: 'Fecha', select: 'Lista', multiselect: 'Lista múltiple' };

export default async function CustomFieldsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can } = await requireOrg(org);
  const fields = await container().organizations.customFields(ctx);
  const manage = can('org.manage');
  return (
    <>
      <PageHeader title="Campos personalizados" description="Datos propios de tu negocio, sin tocar la base de datos: se guardan en JSONB y se validan contra estas definiciones." />
      <Ruled cols={manage ? 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}>
        <Cell>
          {fields.length === 0 ? (
            <EmptyState title="Sin campos personalizados">Por ejemplo: «Palés» en los albaranes o «Ubicación en estantería» en los artículos.</EmptyState>
          ) : (
            <Table minWidth={560}>
              <thead>
                <tr>
                  <Th>Entidad</Th>
                  <Th>Campo</Th>
                  <Th>Tipo</Th>
                  <Th>Opciones</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <Tr key={f.id}>
                    <Td className="text-ink-2">{ENTITY[f.entity]}</Td>
                    <Td>
                      <span className="font-medium">{f.label}</span>
                      {f.isRequired && <span className="text-danger"> *</span>}
                      <code className="block text-xs text-ink-3">{f.key}</code>
                    </Td>
                    <Td>{TYPE[f.dataType]}</Td>
                    <Td className="text-ink-2">{f.options.join(', ') || '—'}</Td>
                    <Td>
                      {manage && (
                        <ActionForm action={deleteCustomField.bind(null, org, f.id)}>
                          <SubmitButton variant="ghost" className="h-8 px-2">Quitar</SubmitButton>
                        </ActionForm>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Cell>
        {manage && (
          <Cell title="Nuevo campo">
            <ActionForm action={createCustomField.bind(null, org)} className="flex flex-col gap-3" resetOnSuccess>
              <SelectField label="En" name="entity" options={Object.entries(ENTITY).map(([value, label]) => ({ value, label }))} />
              <TextField label="Etiqueta" name="label" required placeholder="Palés" />
              <TextField label="Clave" name="key" required placeholder="pales" hint="Minúsculas y _, sin espacios" />
              <SelectField label="Tipo" name="dataType" options={Object.entries(TYPE).map(([value, label]) => ({ value, label }))} />
              <TextField label="Opciones (listas)" name="options" placeholder="Rojo, Verde, Azul" hint="Separadas por comas" />
              <CheckboxField label="Obligatorio" name="isRequired" />
              <div>
                <SubmitButton>Crear campo</SubmitButton>
              </div>
            </ActionForm>
          </Cell>
        )}
      </Ruled>
    </>
  );
}
