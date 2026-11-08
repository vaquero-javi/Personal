// Compartido entre servidor y cliente (no es un módulo 'use client').

/** Apariencia elegida: «system» sigue al sistema operativo. Se guarda en este terminal. */
export type Theme = 'system' | 'light' | 'dark';

export const THEME_KEY = 'omnia-theme';

/** Fondo de ventana de cada modo, para la barra del navegador (<meta name="theme-color">). */
export const THEME_COLOR = { light: '#f2f2f7', dark: '#000000' } as const;

/**
 * Se ejecuta antes del primer pintado: aplica la apariencia guardada para que
 * no haya destello del modo contrario al cargar.
 */
export const themeGuardScript = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
