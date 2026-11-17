import 'server-only';
import type { CustomFieldEntity, TenantContext } from '@omnia/core';
import type { CustomFieldDef } from '@/components/ui/custom-fields';
import { container } from './container';

/** Campos personalizados de una entidad (Ajustes › Campos personalizados), listos para el formulario. */
export async function customFieldsFor(ctx: TenantContext, entity: CustomFieldEntity): Promise<CustomFieldDef[]> {
  return (await container().organizations.customFields(ctx))
    .filter((f) => f.entity === entity)
    .map((f) => ({ key: f.key, label: f.label, dataType: f.dataType, isRequired: f.isRequired, options: f.options }));
}
