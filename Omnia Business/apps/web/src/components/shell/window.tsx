'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Columna de contenido de la ventana: hace scroll por dentro (escritorio) con una
 * barra de herramientas translúcida encima. El filete de la barra solo aparece
 * cuando hay contenido pasando por debajo (efecto de borde de scroll).
 */
export function Window({ toolbar, children }: { toolbar?: ReactNode; children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry!.isIntersecting), { threshold: 0, rootMargin: '-51px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <main className="flex min-w-0 flex-1 flex-col md:h-dvh md:overflow-y-auto">
      {toolbar && (
        <div
          data-scrolled={scrolled || undefined}
          className="material-bar sticky top-0 z-20 hidden h-[52px] shrink-0 items-center gap-3 border-b border-transparent px-8 transition-[border-color] duration-200 data-[scrolled]:border-line-soft md:flex"
        >
          {toolbar}
        </div>
      )}
      <div ref={sentinel} aria-hidden className="-mb-px h-px" />
      <div className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-4 px-4 pt-4 pb-16 md:gap-5 md:px-8 md:pt-2">{children}</div>
    </main>
  );
}
