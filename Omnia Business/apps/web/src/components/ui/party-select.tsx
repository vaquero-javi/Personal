'use client';

import { useState, type ReactNode } from 'react';
import { SelectField } from './form';

type Option = { value: string; label: string };

/**
 * Selector de cliente o proveedor que admite darlo de alta al momento: lo que
 * pinta `renderMissing` (p. ej. «Crear proveedor») recibe `select`, que añade la
 * opción nueva y la deja elegida. Solo se rehace el selector, no el formulario.
 */
export function PartySelect({
  label,
  name,
  options,
  defaultValue,
  className,
  renderMissing,
}: {
  label: string;
  name: string;
  options: Option[];
  defaultValue: string;
  className?: string;
  renderMissing?: ((select: (option: Option) => void) => ReactNode) | undefined;
}) {
  const [created, setCreated] = useState<Option[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const all = [...options, ...created.filter((c) => !options.some((o) => o.value === c.value))].sort((a, b) => a.label.localeCompare(b.label, 'es'));
  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <SelectField key={chosen ?? 'initial'} label={label} name={name} options={all} placeholder="Elige…" required defaultValue={chosen ?? defaultValue} />
      {!chosen &&
        renderMissing?.((option) => {
          setCreated((cs) => [...cs, option]);
          setChosen(option.value);
        })}
    </div>
  );
}
