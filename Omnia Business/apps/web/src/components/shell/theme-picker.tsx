'use client';

import { useEffect, useState } from 'react';
import { THEME_COLOR, THEME_KEY, type Theme } from '@/components/theme';

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Automático' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

const read = (): Theme => {
  const t = document.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : 'system';
};

/** La barra del navegador sigue a la apariencia elegida, no solo a la del sistema. */
function syncThemeColor(theme: Theme) {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const media = meta.getAttribute('data-media') ?? meta.media;
    meta.setAttribute('data-media', media);
    if (theme === 'system') {
      meta.media = media;
      meta.content = media.includes('dark') ? THEME_COLOR.dark : THEME_COLOR.light;
    } else {
      meta.media = 'all';
      meta.content = THEME_COLOR[theme];
    }
  });
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Sin almacenamiento (navegación privada): vale para esta visita.
  }
  syncThemeColor(theme);
}

/** Apariencia: Automático · Claro · Oscuro, como control segmentado de iconos. */
export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const current = read();
    setTheme(current);
    syncThemeColor(current);
  }, []);

  const choose = (next: Theme) => {
    if (next === theme) return;
    setTheme(next);
    // Fundido suave entre modos (evita el salto brusco de brillo); sin él si se pide menos movimiento.
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!calm && 'startViewTransition' in document) document.startViewTransition(() => apply(next));
    else apply(next);
  };

  return (
    <div role="radiogroup" aria-label="Apariencia" className="grid grid-cols-3 gap-0.5 rounded-[9px] bg-fill p-0.5">
      {OPTIONS.map(({ value, label }) => {
        const on = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => choose(value)}
            className={`pressable flex h-7 items-center justify-center rounded-[7px] px-1 text-[12px] ${
              on ? 'bg-sheet font-semibold text-ink shadow-[var(--shadow-raised)] dark:bg-fill-strong' : 'font-medium text-ink-3 hover:text-ink'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
