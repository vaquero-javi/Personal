'use client';

import { useEffect, useState } from 'react';
import { CircleCheck, X } from 'lucide-react';
import { FLASH_EVENT } from './form';

/** Aviso flotante de éxito (abajo a la derecha, se cierra solo a los 5 s). */
export function FlashHost() {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => {
    const onFlash = (e: Event) => setMessage({ text: (e as CustomEvent<string>).detail, id: Date.now() });
    window.addEventListener(FLASH_EVENT, onFlash);
    return () => window.removeEventListener(FLASH_EVENT, onFlash);
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 flex justify-center md:bottom-6">
      {message && (
        <p
          key={message.id}
          role="status"
          className="material pointer-events-auto flex max-w-md animate-[toast-in_360ms_var(--ease-spring)] items-center gap-2.5 rounded-full py-2.5 pr-2.5 pl-3.5 text-[14px] font-medium text-ink shadow-[var(--shadow-float)]"
        >
          <CircleCheck aria-hidden className="size-5 shrink-0 text-ok" />
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Cerrar aviso" className="pressable ml-1 flex size-6 items-center justify-center rounded-full bg-fill text-ink-3 hover:text-ink">
            <X aria-hidden className="size-3.5" strokeWidth={2.5} />
          </button>
        </p>
      )}
    </div>
  );
}
