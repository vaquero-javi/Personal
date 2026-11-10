'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * Entradas al hacer scroll. Sin JavaScript todo se ve: solo cuando este
 * componente monta se ocultan los elementos `[data-reveal]` que aún no están
 * en pantalla, y aparecen (escalonados con `--i`) al llegar a ellos.
 */
export function RevealRoot({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>('[data-reveal]')];
    const show = (item: Element) => item.setAttribute('data-in', '');
    for (const item of items) if (item.getBoundingClientRect().top < innerHeight) show(item);
    el.classList.add('ln-js');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            show(e.target);
            io.unobserve(e.target);
          }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    for (const item of items) if (!item.hasAttribute('data-in')) io.observe(item);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={root} className="ln">
      {children}
    </div>
  );
}
