'use client';

import { useTransition } from 'react';
import { Store } from 'lucide-react';

/**
 * Selector de empresa (negocio o local) de la barra superior. Al cambiar, se
 * guarda y la página se vuelve a pintar filtrada. «Todas» = la sociedad entera.
 */
export function EstablishmentPicker({
  establishments,
  activeId,
  action,
}: {
  establishments: { id: string; name: string }[];
  activeId: string | null;
  action: (formData: FormData) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  return (
    <form action={action} className="flex items-center">
      <label className="flex h-8 items-center gap-1.5 rounded-full bg-fill pr-1 pl-2.5 text-[13px] font-medium focus-within:ring-[3px] focus-within:ring-tint/40">
        <Store aria-hidden className="size-[15px] text-ink-3" strokeWidth={2} />
        <span className="sr-only">Empresa</span>
        <select
          name="establishmentId"
          defaultValue={activeId ?? ''}
          disabled={pending}
          aria-busy={pending}
          onChange={(e) => {
            const data = new FormData(e.currentTarget.form!);
            start(() => action(data));
          }}
          className="h-8 max-w-[12rem] cursor-pointer truncate bg-transparent pr-1 outline-none"
        >
          <option value="">Todas las empresas</option>
          {establishments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
