'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';

/**
 * Buscador de sociedades de la barra superior. En la lista filtra mientras se
 * escribe; desde cualquier otra página, Intro lleva a la lista ya filtrada.
 * La búsqueda vive en la URL (?q=), así que se puede compartir o volver atrás.
 */
export function OrgSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const onList = pathname === '/';
  const current = onList ? (params.get('q') ?? '') : '';
  const [value, setValue] = useState(current);
  const input = useRef<HTMLInputElement>(null);

  // Si la URL cambia por fuera (atrás, enlace), el campo la sigue.
  useEffect(() => setValue(current), [current]);

  // «/» enfoca el buscador desde cualquier sitio (salvo escribiendo en otro campo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (q: string) => {
    const url = q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : '/';
    if (onList) router.replace(url, { scroll: false });
    else router.push(url);
  };

  // En la lista, filtra al escribir (con una pausa corta para no pedir en cada tecla).
  useEffect(() => {
    if (!onList || value.trim() === current.trim()) return;
    const t = setTimeout(() => go(value), 200);
    return () => clearTimeout(t);
  }, [value, onList]);

  return (
    <form
      role="search"
      className="w-full max-w-[320px]"
      onSubmit={(e) => {
        e.preventDefault();
        go(value);
      }}
    >
      <label className="flex h-8 items-center gap-1.5 rounded-[9px] bg-fill px-2.5 focus-within:bg-sheet focus-within:ring-[3px] focus-within:ring-tint/40">
        <Search aria-hidden className="size-[15px] shrink-0 text-ink-3" strokeWidth={2.2} />
        <span className="sr-only">Buscar sociedad</span>
        <input
          ref={input}
          name="q"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && value) {
              e.preventDefault();
              setValue('');
              if (onList) go('');
            }
          }}
          placeholder="Buscar sociedad, CIF…"
          autoComplete="off"
          spellCheck={false}
          className="w-full min-w-0 bg-transparent text-[14px] outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => {
              setValue('');
              if (onList) go('');
              input.current?.focus();
            }}
            className="flex size-5 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-fill-strong hover:text-ink"
          >
            <X aria-hidden className="size-3.5" strokeWidth={2.4} />
          </button>
        )}
      </label>
    </form>
  );
}
