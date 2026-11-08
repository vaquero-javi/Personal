'use client';

import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';

// Botones de iPadOS: rellenos, sin bordes; respuesta inmediata al tocar (scale 0.97).
const VARIANTS = {
  primary: 'bg-tint text-on-tint hover:bg-tint-hover',
  secondary: 'bg-fill text-ink hover:bg-fill-strong',
  ghost: 'text-tint hover:bg-fill active:bg-fill-strong',
  danger: 'bg-sys-red text-white hover:brightness-105',
  ok: 'bg-sys-green text-white hover:brightness-105',
} as const;

const SIZES = {
  sm: 'h-9 px-3.5 text-[14px] rounded-full',
  md: 'h-11 px-4.5 text-[15px] rounded-full',
  lg: 'h-14 px-5 text-[17px] rounded-[14px]',
  xl: 'h-20 px-6 text-[19px] rounded-[18px]',
} as const;

export function buttonClass(variant: keyof typeof VARIANTS = 'secondary', size: keyof typeof SIZES = 'md') {
  return `pressable inline-flex shrink-0 items-center justify-center gap-2 font-semibold disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]}`;
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
      // Hoja de iPadOS: centrada, esquinas amplias, entra subiendo y materializándose.
      className={`m-auto w-[calc(100%-2rem)] rounded-[22px] bg-sheet p-0 text-ink shadow-[var(--shadow-float)] open:animate-[sheet-in_320ms_var(--ease-spring)] ${wide === 'xl' ? 'max-w-6xl' : wide ? 'max-w-3xl' : 'max-w-md'}`}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="relative flex min-h-14 items-center justify-center px-14 pt-2">
            <h2 className="text-center text-[17px] font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="pressable absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-fill text-ink-3 hover:bg-fill-strong hover:text-ink"
            >
              <X className="size-4" strokeWidth={2.6} aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-5 pt-3 pb-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Notice({ tone = 'info', children, className = '' }: { tone?: 'info' | 'warning' | 'danger' | 'ok'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'bg-fill text-ink-2',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    ok: 'bg-ok-soft text-ok',
  };
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-[14px] px-4 py-3 text-[15px] font-medium ${tones[tone]} ${className}`}>{children}</div>;
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
      className="material fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-50 mx-auto flex w-fit max-w-[90vw] animate-[toast-in_360ms_var(--ease-spring)] items-center gap-2.5 rounded-full py-3 pr-5 pl-3.5 text-[15px] font-semibold text-ink shadow-[var(--shadow-float)]"
    >
      {flash.tone === 'danger' ? (
        <CircleAlert className="size-5 shrink-0 text-danger" aria-hidden />
      ) : (
        <CircleCheck className="size-5 shrink-0 text-ok" aria-hidden />
      )}
      {flash.text}
    </div>
  ) : null;
  return [node, show] as const;
}
