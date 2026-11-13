'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Al abrir una conversación queda leída, pero el marco (barra lateral y
 * pestañas con los no leídos) se pinta a la vez que la página: un refresco al
 * montarla actualiza los contadores.
 */
export function RefreshOnce({ when }: { when: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (when) router.refresh();
  }, [when, router]);
  return null;
}
