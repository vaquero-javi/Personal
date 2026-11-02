'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui';

export function PrintButton() {
  return (
    <Button size="lg" onClick={() => window.print()}>
      <Printer className="size-5" aria-hidden /> Imprimir
    </Button>
  );
}
