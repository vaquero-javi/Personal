const VALID_ROUTES = new Set(['/', '/game']);
const listeners = new Set();

function normalizePath(path) {
  return VALID_ROUTES.has(path) ? path : '/';
}

export function getCurrentPath() {
  return normalizePath(window.location.pathname || '/');
}

export function navigate(path) {
  const nextPath = normalizePath(path);

  if (window.location.pathname !== nextPath) {
    window.history.pushState({}, '', nextPath);
  }

  notify(nextPath);
}

export function subscribeToRouter(listener) {
  listeners.add(listener);
  listener(getCurrentPath());

  return () => {
    listeners.delete(listener);
  };
}

function notify(path) {
  for (const listener of listeners) {
    listener(path);
  }
}

window.addEventListener('popstate', () => {
  notify(getCurrentPath());
});

if (!VALID_ROUTES.has(window.location.pathname)) {
  window.history.replaceState({}, '', '/');
}