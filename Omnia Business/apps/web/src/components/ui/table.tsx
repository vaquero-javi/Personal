import Link from 'next/link';
import type { ReactNode } from 'react';

// Literales completos para que Tailwind los detecte.
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

// Tabla de trabajo: cabecera gris, filas con filete, cifras a la derecha.
// En móvil, se desplaza en horizontal dentro de su casilla con una pista visual.

export function Table({ children, minWidth = 640 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="-mx-4 overflow-x-auto md:-mx-5 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] md:[mask-image:none]">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, align = 'left', className = '' }: { children?: ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  return (
    <th
      scope="col"
      className={`border-b border-line bg-sheet-head px-2 py-[7px] text-xs font-semibold whitespace-nowrap text-ink-3 first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5 ${ALIGN[align]} ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', className = '' }: { children?: ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  return <td className={`border-b border-line-soft px-2 py-[9px] align-middle first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5 ${ALIGN[align]} ${className}`}>{children}</td>;
}

/** Fila enlazada: toda la fila navega, el primer enlace es el accesible. */
export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-ink underline-offset-2 after:absolute after:inset-0 hover:underline">
      {children}
    </Link>
  );
}

export function Tr({ children, highlight }: { children: ReactNode; highlight?: boolean }) {
  return <tr className={`relative hover:bg-sheet-head ${highlight ? 'bg-danger-soft/40' : ''}`}>{children}</tr>;
}
