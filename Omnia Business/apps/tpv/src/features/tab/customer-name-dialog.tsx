'use client';

import { useEffect, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import { Button, Modal } from '@/components/ui';

/**
 * Nombre de quien pide en la mesa. Se puede dejar en blanco y aceptar: es solo
 * para que barra/cocina sepa a quién va la comanda.
 */
export function CustomerNameDialog({
  open,
  onClose,
  onAccept,
  title,
  initial = '',
  acceptLabel = 'Aceptar',
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onAccept: (name: string) => void;
  title: string;
  initial?: string;
  acceptLabel?: string;
  busy?: boolean;
}) {
  const [name, setName] = useState(initial);
  const input = useRef<HTMLInputElement>(null);

  // Cada vez que se abre, empieza con el nombre actual y el cursor en el campo.
  useEffect(() => {
    if (!open) return;
    setName(initial);
    const t = setTimeout(() => input.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, initial]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onAccept(name.trim());
        }}
      >
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          Nombre del cliente <span className="font-normal text-ink-3">Opcional · saldrá en la comanda junto a la mesa</span>
          <span className="relative">
            <UserRound aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-3" />
            <input
              ref={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
              placeholder="Por ejemplo, Laura"
              className="h-14 w-full rounded-[14px] bg-fill pr-4 pl-11 text-[19px] font-normal text-ink outline-none placeholder:text-ink-3 focus:ring-[3px] focus:ring-tint/45"
            />
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" size="lg" variant="primary" disabled={busy}>
            {busy ? 'Abriendo…' : acceptLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
