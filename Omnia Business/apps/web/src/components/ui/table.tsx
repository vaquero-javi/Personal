import Link from 'next/link';
import type { ReactNode } from 'react';

// Literales completos para que Tailwind los detecte.
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

// Tabla como lista agrupada: cabecera discreta, separadores finos, cifras a la derecha.
// En móvil, se desplaza en horizontal dentro de su casilla con una pista visual.

export function Table({ children, minWidth = 640 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="-mx-4 overflow-x-auto md:-mx-5 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] md:[mask-image:none]">
      <table className="w-full border-collapse text-[14px]" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, align = 'left', className = '' }: { children?: ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  return (
    <th
      scope="col"
      className={`border-b border-line-soft px-2 pt-1 pb-2 text-[12px] font-medium whitespace-nowrap text-ink-3 first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5 ${ALIGN[align]} ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', className = '' }: { children?: ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  return <td className={`border-b border-line-soft px-2 py-2.5 align-middle group-last/row:border-b-0 first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5 ${ALIGN[align]} ${className}`}>{children}</td>;
}

/** Fila enlazada: toda la fila navega, el primer enlace es el accesible. */
export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-ink after:absolute after:inset-0">
      {children}
    </Link>
  );
}

export function Tr({ children, highlight }: { children: ReactNode; highlight?: boolean }) {
  return <tr className={`group/row relative transition-colors duration-100 hover:bg-fill/60 active:bg-fill ${highlight ? 'bg-danger-soft/50' : ''}`}>{children}</tr>;
}
