'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { THEME_COLOR, THEME_KEY, type Theme } from '@/components/theme';

const OPTIONS: { value: Theme; label: string; Icon: LucideIcon }[] = [
  { value: 'system', label: 'Automático', Icon: Monitor },
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
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

/** Apariencia del terminal: Automático · Claro · Oscuro, como segmentado de iconos (se guarda en esta tablet). */
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
    <div role="radiogroup" aria-label="Apariencia" className="flex gap-0.5 rounded-full bg-fill p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => {
        const on = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={label}
            onClick={() => choose(value)}
            className={`pressable flex size-9 items-center justify-center rounded-full ${
              on ? 'bg-sheet text-ink shadow-[var(--shadow-raised)] dark:bg-fill-strong' : 'text-ink-3 hover:text-ink'
            }`}
          >
            <Icon className="size-[18px]" strokeWidth={2.1} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
