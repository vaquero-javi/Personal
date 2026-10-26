'use client';

import { useState } from 'react';
import { Field, inputClass } from './form';

export interface CustomFieldDef {
  key: string;
  label: string;
  dataType: string;
  isRequired: boolean;
  options: string[];
}

/**
 * Campos que cada empresa define en Ajustes › Campos personalizados. Se envían
 * tipados en `customFieldsJson` y el servidor los valida contra las definiciones.
 */
export function CustomFieldInputs({ definitions, initial = {} }: { definitions: CustomFieldDef[]; initial?: Record<string, unknown> }) {
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  if (definitions.length === 0) return null;
  const set = (key: string, value: unknown) =>
    setValues((v) => {
      const next = { ...v };
      if (value === '' || value === undefined || (Array.isArray(value) && value.length === 0)) delete next[key];
      else next[key] = value;
      return next;
    });

  return (
    <fieldset className="grid gap-4 md:grid-cols-2">
      <legend className="mb-2 text-sm font-bold">Campos personalizados</legend>
      <input type="hidden" name="customFieldsJson" value={JSON.stringify(values)} />
      {definitions.map((def) => (
        <Field key={def.key} label={`${def.label}${def.isRequired ? ' *' : ''}`} name={`customFields.${def.key}`}>
          {(p) => {
            const value = values[def.key];
            switch (def.dataType) {
              case 'boolean':
                return (
                  <label className="flex h-[34px] items-center gap-2 text-sm">
                    <input id={p.id} type="checkbox" className="size-4 accent-ink" checked={value === true} onChange={(e) => set(def.key, e.target.checked || undefined)} />
                    Sí
                  </label>
                );
              case 'number':
                return <input {...p} name={undefined} inputMode="decimal" className={inputClass} value={value === undefined ? '' : String(value)} onChange={(e) => set(def.key, e.target.value === '' ? '' : Number(e.target.value.replace(',', '.')))} />;
              case 'date':
                return <input {...p} name={undefined} type="date" className={inputClass} value={(value as string) ?? ''} onChange={(e) => set(def.key, e.target.value)} />;
              case 'select':
                return (
                  <select {...p} name={undefined} className={inputClass} value={(value as string) ?? ''} onChange={(e) => set(def.key, e.target.value)}>
                    <option value="">—</option>
                    {def.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                );
              case 'multiselect': {
                const selected = (value as string[]) ?? [];
                return (
                  <div id={p.id} className="flex flex-wrap gap-3 pt-1 text-sm">
                    {def.options.map((o) => (
                      <label key={o} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          className="size-4 accent-ink"
                          checked={selected.includes(o)}
                          onChange={(e) => set(def.key, e.target.checked ? [...selected, o] : selected.filter((x) => x !== o))}
                        />
                        {o}
                      </label>
                    ))}
                  </div>
                );
              }
              default:
                return <input {...p} name={undefined} className={inputClass} value={(value as string) ?? ''} onChange={(e) => set(def.key, e.target.value)} />;
            }
          }}
        </Field>
      ))}
    </fieldset>
  );
}
