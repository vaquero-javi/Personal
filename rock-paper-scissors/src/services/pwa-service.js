export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/service-worker.js');
    } catch {
      // El fallo del service worker no debe bloquear la aplicación.
    }
  });
}