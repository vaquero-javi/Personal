import { CustomFieldDefinition, parseCustomFields, type CustomFieldEntity } from '@omnia/core';
import type { Tx } from './client';

/**
 * Valida los campos personalizados de una entidad contra las definiciones de
 * la sociedad (Ajustes › Campos personalizados).
 *
 * `undefined` = el formulario no los envía (altas automáticas o rápidas, como
 * un fichaje desde el TPV o un proveedor creado al escanear una factura): no se
 * validan ni se tocan, para que un campo obligatorio no bloquee esas vías.
 */
export async function validateCustomFields(
  tx: Tx,
  organizationId: string,
  entity: CustomFieldEntity,
  value: unknown,
): Promise<Record<string, unknown> | undefined> {
  if (value === undefined) return undefined;
  const definitions = (
    await tx<{ key: string; data_type: string; is_required: boolean; options: unknown }[]>`
      select key, data_type, is_required, options from custom_field_definitions
      where organization_id = ${organizationId} and entity = ${entity}`
  ).map((d) => CustomFieldDefinition.parse({ key: d.key, dataType: d.data_type, isRequired: d.is_required, options: d.options }));
  return parseCustomFields(definitions, value);
}
