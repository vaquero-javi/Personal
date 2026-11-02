import type { ReactNode } from 'react';
import { requireShift } from '@/server/session';

export const dynamic = 'force-dynamic';

/** Documentos para la impresora de tickets (80 mm): sin barra del turno. */
export default async function PrintLayout({ children }: { children: ReactNode }) {
  await requireShift();
  return <div className="flex min-h-dvh justify-center bg-carton p-4 print:bg-white print:p-0">{children}</div>;
}
