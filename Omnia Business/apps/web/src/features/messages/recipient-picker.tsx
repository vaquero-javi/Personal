'use client';

import { useId, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useFieldErrors } from '@/components/ui/form';

/**
 * «Para:» con búsqueda. Cada persona elegida es un <input hidden name="recipients">,
 * así el formulario manda la lista sin JavaScript extra. Solo ofrece personas de
 * la sociedad (la base lo vuelve a comprobar al enviar).
 */
export function RecipientPicker({ people, initial = [] }: { people: { userId: string; name: string; roleName: string }[]; initial?: string[] }) {
  const [chosen, setChosen] = useState<string[]>(initial.filter((id) => people.some((p) => p.userId === id)));
  const [query, setQuery] = useState('');
  const listId = useId();
  const error = useFieldErrors().recipients;
  const byId = useMemo(() => new Map(people.map((p) => [p.userId, p])), [people]);
  const q = query.trim().toLowerCase();
  const options = people.filter((p) => !chosen.includes(p.userId) && (!q || p.name.toLowerCase().includes(q) || p.roleName.toLowerCase().includes(q))).slice(0, 8);

  const add = (id: string) => {
    setChosen((c) => (c.includes(id) ? c : [...c, id]));
    setQuery('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={listId} className="text-[13px] text-ink-2">Para</label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] bg-fill px-2 py-1.5 focus-within:bg-sheet focus-within:ring-[3px] focus-within:ring-tint/45">
        {chosen.map((id) => (
          <span key={id} className="flex items-center gap-1 rounded-full bg-tint-soft py-0.5 pr-1 pl-2.5 text-[13px] font-medium text-tint">
            {byId.get(id)?.name}
            <input type="hidden" name="recipients" value={id} />
            <button type="button" onClick={() => setChosen((c) => c.filter((x) => x !== id))} aria-label={`Quitar a ${byId.get(id)?.name}`} className="flex size-5 items-center justify-center rounded-full hover:bg-tint/15">
              <X aria-hidden className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          id={listId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && options[0]) {
              e.preventDefault();
              add(options[0].userId);
            } else if (e.key === 'Backspace' && !query && chosen.length) {
              setChosen((c) => c.slice(0, -1));
            }
          }}
          placeholder={chosen.length ? '' : 'Escribe un nombre o un rol…'}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className="h-7 min-w-[10rem] flex-1 bg-transparent px-1 text-[15px] outline-none placeholder:text-ink-3"
        />
      </div>
      {(q || chosen.length === 0) && options.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Sugerencias">
          {options.map((p) => (
            <li key={p.userId}>
              <button type="button" onClick={() => add(p.userId)} className="pressable rounded-full bg-fill px-3 py-1 text-[13px] hover:bg-fill-strong">
                {p.name} <span className="text-ink-3">· {p.roleName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {people.length === 0 && <p className="text-[13px] text-ink-3">No hay nadie más en esta sociedad todavía.</p>}
      {error && <p className="text-[12px] font-medium text-danger">{error}</p>}
    </div>
  );
}
