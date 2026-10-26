import { z } from 'zod';
import { DomainError } from './errors';

export const CustomFieldEntity = z.enum(['inventory_item', 'party', 'invoice', 'goods_receipt', 'incident', 'time_entry']);
export type CustomFieldEntity = z.infer<typeof CustomFieldEntity>;

export const CustomFieldDefinition = z.object({
  key: z.string(),
  dataType: z.enum(['text', 'number', 'boolean', 'date', 'select', 'multiselect']),
  isRequired: z.boolean(),
  options: z.array(z.string()),
});
export type CustomFieldDefinition = z.infer<typeof CustomFieldDefinition>;

function fieldSchema(def: CustomFieldDefinition): z.ZodType {
  const inOptions = (value: string) => def.options.includes(value);
  switch (def.dataType) {
    case 'text':
      return z.string().max(2000);
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'date':
      return z.iso.date();
    case 'select':
      return z.string().refine(inOptions, 'Opción no válida');
    case 'multiselect':
      return z.array(z.string().refine(inOptions, 'Opción no válida'));
  }
}

/**
 * Valida la columna JSONB `custom_fields` contra las definiciones que cada
 * empresa configura en `custom_field_definitions`. Las claves desconocidas se
 * rechazan para que el JSONB no acumule basura.
 */
export function parseCustomFields(definitions: readonly CustomFieldDefinition[], value: unknown): Record<string, unknown> {
  const shape: Record<string, z.ZodType> = {};
  for (const def of definitions) {
    shape[def.key] = def.isRequired ? fieldSchema(def) : fieldSchema(def).optional();
  }
  const result = z.strictObject(shape).safeParse(value ?? {});
  if (!result.success) {
    throw new DomainError('VALIDATION', 'Campos personalizados no válidos', { issues: result.error.issues });
  }
  return result.data;
}
