/** Marca en sessionStorage: la pantalla de carga sale una vez por sesión del navegador. */
export const SPLASH_SEEN_KEY = 'omnia-splash-seen';

/** Se ejecuta antes del primer pintado: evita el destello si ya se vio o si se pide menos movimiento. */
export const splashGuardScript = `try{if(sessionStorage.getItem('${SPLASH_SEEN_KEY}')||matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.dataset.splash='off'}catch(e){}`;
