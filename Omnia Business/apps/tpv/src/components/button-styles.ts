// Botones de iPadOS: rellenos, sin bordes; respuesta inmediata al tocar (scale 0.97).
export const VARIANTS = {
  primary: 'bg-tint text-on-tint hover:bg-tint-hover',
  secondary: 'bg-fill text-ink hover:bg-fill-strong',
  ghost: 'text-tint hover:bg-fill active:bg-fill-strong',
  danger: 'bg-sys-red text-white hover:brightness-105',
  ok: 'bg-sys-green text-white hover:brightness-105',
} as const;

export const SIZES = {
  sm: 'h-9 px-3.5 text-[14px] rounded-full',
  md: 'h-11 px-4.5 text-[15px] rounded-full',
  lg: 'h-14 px-5 text-[17px] rounded-[14px]',
  xl: 'h-20 px-6 text-[19px] rounded-[18px]',
} as const;

export function buttonClass(variant: keyof typeof VARIANTS = 'secondary', size: keyof typeof SIZES = 'md') {
  return `pressable inline-flex shrink-0 items-center justify-center gap-2 font-semibold disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]}`;
}

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;
