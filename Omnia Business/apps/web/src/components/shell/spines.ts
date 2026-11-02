// Compartido entre servidor y cliente (no es un módulo 'use client').

/** Uno de los cuatro colores de la casa o uno elegido en hexadecimal (#rrggbb). */
export type SpineColor = 'red' | 'blue' | 'yellow' | 'green' | `#${string}`;

export interface ShelfOrg {
  id: string;
  slug: string;
  legalName: string;
  label: string;
  spine: SpineColor;
}

/** Los colores de la casa (los mismos que --color-spine-* en globals.css). */
export const SPINE_PRESETS = [
  { value: 'red', label: 'Rojo', hex: '#d23b2e' },
  { value: 'blue', label: 'Azul', hex: '#1f6fb2' },
  { value: 'yellow', label: 'Amarillo', hex: '#f1c232' },
  { value: 'green', label: 'Verde', hex: '#3a8c4a' },
] as const;

/** Color CSS de un lomo: los de la casa, por su token; los elegidos, tal cual. */
export const spineCss = (spine: SpineColor) => {
  const preset = SPINE_PRESETS.find((p) => p.value === spine);
  return preset ? `var(--color-spine-${preset.value}, ${preset.hex})` : spine;
};
