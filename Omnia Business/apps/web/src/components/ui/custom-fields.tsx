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
export function CustomFieldInputs({
  definitions,
  initial = {},
  columns = 2,
}: {
  definitions: CustomFieldDef[];
  initial?: Record<string, unknown>;
  /** 1 en columnas estrechas (p. ej. un panel lateral). */
  columns?: 1 | 2;
}) {
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
    <fieldset className={`grid gap-4 ${columns === 2 ? 'md:grid-cols-2' : ''}`}>
      <legend className="mb-2 text-sm font-bold">Campos personalizados</legend>
      <input type="hidden" name="customFieldsJson" value={JSON.stringify(values)} />
      {definitions.map((def) => (
        <Field key={def.key} label={`${def.label}${def.isRequired ? ' *' : ''}`} name={`customFields.${def.key}`}>
          {(p) => {
            const value = values[def.key];
            switch (def.dataType) {
              case 'boolean':
                return (
                  <label className="flex h-9 items-center gap-2 text-sm">
                    <input id={p.id} type="checkbox" className="size-4 accent-tint" checked={value === true} onChange={(e) => set(def.key, e.target.checked || undefined)} />
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
                          className="size-4 accent-tint"
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

const formatValue = (def: CustomFieldDef, value: unknown): string => {
  if (def.dataType === 'boolean') return value === true ? 'Sí' : 'No';
  if (def.dataType === 'date' && typeof value === 'string') return new Date(`${value}T00:00:00`).toLocaleDateString('es-ES');
  if (def.dataType === 'number' && typeof value === 'number') return value.toLocaleString('es-ES');
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
};

/** Valores guardados, en solo lectura (fichas que ya no se editan: facturas, incidencias, fichajes). */
export function CustomFieldValues({ definitions, values, className = '' }: { definitions: CustomFieldDef[]; values: Record<string, unknown>; className?: string }) {
  const filled = definitions.filter((d) => values[d.key] !== undefined && values[d.key] !== null && !(Array.isArray(values[d.key]) && (values[d.key] as unknown[]).length === 0));
  if (filled.length === 0) return null;
  return (
    <dl className={`grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 ${className}`}>
      {filled.map((d) => (
        <div key={d.key}>
          <dt className="text-ink-3">{d.label}</dt>
          <dd className="font-medium">{formatValue(d, values[d.key])}</dd>
        </div>
      ))}
    </dl>
  );
}
