'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { SPINE_PRESETS, spineCss, type SpineColor } from '@/components/shell/spines';

/** Paleta del «+»: tonos con cuerpo, que se distinguen en la estantería. */
const PALETTE = [
  '#c2410c', '#b45309', '#a16207', '#4d7c0f',
  '#15803d', '#0f766e', '#0e7490', '#1d4ed8',
  '#4338ca', '#7e22ce', '#a21caf', '#be185d',
  '#9f1239', '#78350f', '#57534e', '#1f2937',
];

const swatch = 'relative flex size-7 items-center justify-center rounded ring-offset-2 focus-visible:ring-2 focus-visible:ring-tint focus-visible:outline-none';

/**
 * Color del lomo: los cuatro de la casa y, con «+», una paleta pequeña y un
 * selector libre. Envía el valor en un campo oculto `name`.
 */
export function SpineColorPicker({ name, defaultValue }: { name: string; defaultValue: SpineColor }) {
  const [value, setValue] = useState<SpineColor>(defaultValue);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const custom = value.startsWith('#') ? value : null;

  // Se cierra al tocar fuera o con Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const pick = (color: SpineColor) => {
    setValue(color);
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <input type="hidden" name={name} value={value} />
      {SPINE_PRESETS.map((p) => (
        <button key={p.value} type="button" onClick={() => pick(p.value)} aria-pressed={value === p.value} className="flex items-center gap-2 text-sm disabled:cursor-not-allowed">
          <span aria-hidden className={`${swatch} ${value === p.value ? 'ring-2 ring-tint' : ''}`} style={{ backgroundColor: spineCss(p.value) }} />
          {p.label}
        </button>
      ))}
      {custom && (
        <span className="flex items-center gap-2 text-sm">
          <span aria-hidden className={`${swatch} ring-2 ring-tint`} style={{ backgroundColor: custom }} />
          Personalizado
        </span>
      )}

      <div ref={box} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Elegir otro color"
          title="Elegir otro color"
          className="flex size-7 items-center justify-center rounded border border-dashed border-shelf-edge text-ink-2 hover:border-tint hover:text-tint disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus aria-hidden className="size-4" />
        </button>
        {open && (
          <div role="dialog" aria-label="Paleta de colores" className="absolute top-9 left-0 z-20 w-max rounded-[14px] bg-sheet p-3 shadow-[var(--shadow-float)]">
            <div className="grid grid-cols-4 gap-2">
              {PALETTE.map((c) => (
                <button key={c} type="button" onClick={() => pick(c as SpineColor)} aria-label={c} aria-pressed={value === c} className={swatch} style={{ backgroundColor: c }}>
                  {value === c && <Check aria-hidden className="size-4 text-white" />}
                </button>
              ))}
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-line pt-3 text-sm font-medium">
              <input
                type="color"
                value={custom ?? '#7e22ce'}
                onChange={(e) => setValue(e.target.value.toLowerCase() as SpineColor)}
                className="size-7 cursor-pointer rounded border border-shelf-edge bg-transparent p-0"
              />
              Otro color…
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
