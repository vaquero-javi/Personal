// Compartido entre servidor y cliente (no es un módulo 'use client').

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'info' | 'caution' | 'destructive';

// Botones en cápsula, como en las apps de Apple. Respuesta inmediata al pulsar (scale 0.97).
const base =
  'pressable inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-semibold whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-40';
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-tint text-on-tint hover:bg-tint-hover',
  secondary: 'bg-fill text-tint hover:bg-fill-strong',
  danger: 'bg-danger-soft text-danger hover:bg-[color-mix(in_srgb,var(--color-danger)_18%,transparent)]',
  ghost: 'text-tint hover:bg-fill',
  info: 'bg-sys-indigo text-white hover:brightness-110',
  caution: 'bg-sys-orange text-white hover:brightness-105',
  destructive: 'bg-sys-red text-white hover:brightness-105',
};

export const buttonClass = (variant: ButtonVariant = 'secondary', extra = '') => `${base} ${variants[variant]} ${extra}`;
