import { createInitialState } from '../store/initial-state.js';

const STORAGE_KEY = 'rock-paper-scissors-app-state';

export function loadState() {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return createInitialState();
    }

    const parsedValue = JSON.parse(rawValue);

    if (!parsedValue || typeof parsedValue !== 'object') {
      return createInitialState();
    }

    if (!Array.isArray(parsedValue.players) || !parsedValue.session) {
      return createInitialState();
    }

    return parsedValue;
  } catch {
    return createInitialState();
  }
}

export function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: 'No se ha podido guardar el estado local de la aplicación.'
    };
  }
}