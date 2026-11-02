'use client';

import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-ink text-white hover:bg-[#2c3038] active:bg-black',
  secondary: 'border border-shelf-edge bg-sheet text-ink hover:bg-sheet-head active:bg-line-soft',
  ghost: 'text-ink hover:bg-sheet-head active:bg-line-soft',
  danger: 'bg-danger text-white hover:bg-[#9f2318]',
  ok: 'bg-ok text-white hover:bg-[#276833]',
} as const;

const SIZES = {
  sm: 'h-9 px-3 text-sm rounded-md',
  md: 'h-11 px-4 text-sm rounded-lg',
  lg: 'h-14 px-5 text-base rounded-lg',
  xl: 'h-20 px-6 text-lg rounded-xl',
} as const;

export function buttonClass(variant: keyof typeof VARIANTS = 'secondary', size: keyof typeof SIZES = 'md') {
  return `inline-flex shrink-0 items-center justify-center gap-2 font-semibold transition-colors disabled:opacity-45 ${VARIANTS[variant]} ${SIZES[size]}`;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES }) {
  return <button type="button" {...props} className={`${buttonClass(variant, size)} ${className}`} />;
}

/** Diálogo modal nativo (foco atrapado, Esc para cerrar). */
export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean | 'xl' }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] rounded-xl border border-shelf-edge bg-sheet p-0 text-ink ${wide === 'xl' ? 'max-w-6xl' : wide ? 'max-w-3xl' : 'max-w-md'}`}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-base font-bold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="-mr-2 flex size-10 items-center justify-center rounded-lg hover:bg-sheet-head">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Notice({ tone = 'info', children, className = '' }: { tone?: 'info' | 'warning' | 'danger' | 'ok'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'border-line bg-sheet-head text-ink-2',
    warning: 'border-warning-line bg-warning-soft text-warning',
    danger: 'border-danger bg-danger-soft text-danger',
    ok: 'border-ok-line bg-ok-soft text-ok',
  };
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]} ${className}`}>{children}</div>;
}

/** Aviso flotante breve. */
export function useFlash() {
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'danger'; key: number } | null>(null);
  const show = useCallback((text: string, tone: 'ok' | 'danger' = 'ok') => setFlash({ text, tone, key: Date.now() }), []);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), flash.tone === 'danger' ? 5000 : 2500);
    return () => clearTimeout(t);
  }, [flash]);
  const node = flash ? (
    <div
      key={flash.key}
      role={flash.tone === 'danger' ? 'alert' : 'status'}
      className={`fixed inset-x-0 bottom-6 z-50 mx-auto w-fit max-w-[90vw] rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-lg ${flash.tone === 'danger' ? 'bg-danger' : 'bg-ink'}`}
    >
      {flash.text}
    </div>
  ) : null;
  return [node, show] as const;
}
