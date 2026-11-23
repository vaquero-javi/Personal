import { useEffect, useState } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'

const KEY = 'chronos-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // Sin acceso a localStorage (modo privado): seguir al sistema.
  }
  return 'system'
}

export function applyTheme(pref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'system' && media.matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121110' : '#f6f5f1')
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    // Se aplica igualmente en esta sesión.
  }
  applyTheme(pref)
}

// Si el usuario eligió "Sistema", seguir los cambios del sistema en vivo.
media.addEventListener('change', () => applyTheme())

/** Saber si el tema oscuro está activo, para lo que no se puede resolver con CSS (el lienzo). */
export function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return dark
}

/** Apariencia dentro de las notas y PDF: aparte de la de la app. «auto» sigue a la app. */
export type NotesThemePref = 'light' | 'dark' | 'auto'

const NOTES_KEY = 'chronos-notes-theme'
const NOTES_EVENT = 'chronos-notes-theme'

export function getNotesThemePref(): NotesThemePref {
  try {
    const v = localStorage.getItem(NOTES_KEY)
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch {
    // Sin acceso a localStorage: igual que la app.
  }
  return 'auto'
}

export function setNotesThemePref(pref: NotesThemePref) {
  try {
    localStorage.setItem(NOTES_KEY, pref)
  } catch {
    // Se aplica igualmente en esta sesión.
  }
  window.dispatchEvent(new CustomEvent(NOTES_EVENT, { detail: pref }))
}

/**
 * Modo de las notas: la clase para su contenedor (que cambia los colores de todo lo que hay dentro)
 * y si está en oscuro, para el lienzo y el PDF.
 */
export function useNotesTheme() {
  const appDark = useIsDark()
  const [pref, setPref] = useState(getNotesThemePref)
  useEffect(() => {
    const onChange = (e: Event) => setPref((e as CustomEvent<NotesThemePref>).detail)
    window.addEventListener(NOTES_EVENT, onChange)
    return () => window.removeEventListener(NOTES_EVENT, onChange)
  }, [])
  const dark = pref === 'auto' ? appDark : pref === 'dark'
  return { dark, className: pref === 'auto' ? '' : pref }
}
