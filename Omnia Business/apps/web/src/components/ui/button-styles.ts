// Compartido entre servidor y cliente (no es un módulo 'use client').

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'info' | 'caution' | 'destructive';

const base =
  'inline-flex h-[34px] items-center justify-center gap-1.5 rounded-md px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50';
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white hover:bg-[#2c3038]',
  secondary: 'border border-shelf-edge bg-sheet text-ink hover:bg-sheet-head',
  danger: 'border border-danger/40 bg-sheet text-danger hover:bg-danger-soft',
  ghost: 'text-ink-2 hover:bg-sheet-head hover:text-ink',
  info: 'bg-[#1f6fb2] text-white hover:bg-[#195c94]',
  caution: 'bg-[#ea580c] text-white hover:bg-[#c2410c]',
  destructive: 'bg-[#b8291d] text-white hover:bg-[#962117]',
};

export const buttonClass = (variant: ButtonVariant = 'secondary', extra = '') => `${base} ${variants[variant]} ${extra}`;
