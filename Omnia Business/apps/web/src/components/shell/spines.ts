// Compartido entre servidor y cliente (no es un módulo 'use client').

export type SpineColor = 'red' | 'blue' | 'yellow' | 'green';

export interface ShelfOrg {
  id: string;
  slug: string;
  legalName: string;
  label: string;
  spine: SpineColor;
}

/** Clases por color de lomo. Literales completos para que Tailwind los detecte. */
export const spineClasses: Record<SpineColor, { bg: string; tabTop: string; dot: string }> = {
  red: { bg: 'bg-spine-red', tabTop: 'border-t-spine-red', dot: 'bg-spine-red' },
  blue: { bg: 'bg-spine-blue', tabTop: 'border-t-spine-blue', dot: 'bg-spine-blue' },
  yellow: { bg: 'bg-spine-yellow', tabTop: 'border-t-spine-yellow', dot: 'bg-spine-yellow' },
  green: { bg: 'bg-spine-green', tabTop: 'border-t-spine-green', dot: 'bg-spine-green' },
};
