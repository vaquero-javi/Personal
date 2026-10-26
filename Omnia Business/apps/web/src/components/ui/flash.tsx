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
    <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex justify-end md:inset-x-6 md:bottom-6">
      {message && (
        <p key={message.id} role="status" className="pointer-events-auto flex max-w-md items-start gap-2 rounded-md bg-ink px-4 py-3 text-sm text-white shadow-[0_6px_20px_rgba(0,0,0,0.25)]">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-[#8fd19e]" />
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Cerrar aviso" className="-mr-1 ml-2 rounded p-0.5 text-white/70 hover:text-white">
            <X aria-hidden className="size-4" />
          </button>
        </p>
      )}
    </div>
  );
}
