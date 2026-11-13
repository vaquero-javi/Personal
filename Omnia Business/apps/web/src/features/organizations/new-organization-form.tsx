'use client';

import { useState } from 'react';
import { Building2, Landmark } from 'lucide-react';
import { ActionForm, SelectField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { createOrganization } from '@/server/session-actions';

type Kind = 'company' | 'holding';

const KINDS: { value: Kind; label: string; hint: string; Icon: typeof Building2 }[] = [
  { value: 'company', label: 'Sociedad', hint: 'Factura con su NIF. Dentro tendrá sus empresas (negocios o locales).', Icon: Building2 },
  { value: 'holding', label: 'Holding', hint: 'Sociedad matriz: agrupa otras sociedades y ve sus cifras juntas.', Icon: Landmark },
];

/** Alta de holding o sociedad. Una sociedad puede colgar de un holding que gestiones. */
export function NewOrganizationForm({ holdings, defaultParentId }: { holdings: { id: string; label: string }[]; defaultParentId?: string }) {
  const [kind, setKind] = useState<Kind>('company');
  const copy = kind === 'holding'
    ? { legal: 'Grupo Ejemplo S.L.', slug: 'grupo-ejemplo', submit: 'Crear holding' }
    : { legal: 'Distribuciones Ejemplo S.L.', slug: 'distribuciones-ejemplo', submit: 'Crear sociedad' };
  return (
    <ActionForm action={createOrganization} className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-1.5 text-[13px] text-ink-2">Qué vas a crear</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {KINDS.map(({ value, label, hint, Icon }) => (
            <label
              key={value}
              className="pressable flex cursor-pointer items-start gap-3 rounded-[12px] bg-fill px-3.5 py-3 ring-tint has-[:checked]:bg-tint-soft has-[:checked]:ring-2 has-[:focus-visible]:ring-[3px]"
            >
              <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
              <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-tint" strokeWidth={2} />
              <span>
                <span className="block text-[15px] font-semibold">{label}</span>
                <span className="block text-[13px] text-ink-3">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {kind === 'company' && holdings.length > 0 && (
        <SelectField
          label="Pertenece al holding"
          name="parentId"
          defaultValue={defaultParentId ?? ''}
          placeholder="Ninguno (sociedad independiente)"
          options={holdings.map((h) => ({ value: h.id, label: h.label }))}
          hint="Solo aparecen los holdings que gestionas. Se puede cambiar después en Ajustes."
        />
      )}
      <TextField label="Razón social" name="legalName" required placeholder={copy.legal} />
      <TextField label="NIF" name="taxId" required placeholder="B12345678" />
      <TextField label="Identificador en la dirección" name="slug" required placeholder={copy.slug} hint={`Aparecerá en la URL: /o/${copy.slug}`} />
      <div>
        <SubmitButton pendingLabel="Creando…">{copy.submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}
