'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import { Button, buttonClass } from '@/components/ui';

/** Lanza el diálogo de impresión al abrir y deja volver al TPV. */
export function PrintControls({ back, autoPrint = true }: { back: string; autoPrint?: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [autoPrint]);
  return (
    <div className="no-print mb-4 flex gap-3">
      <Link href={back} className={buttonClass('primary', 'lg')}>Volver</Link>
      <Button size="lg" onClick={() => window.print()}>
        <Printer className="size-5" aria-hidden /> Imprimir
      </Button>
    </div>
  );
}
