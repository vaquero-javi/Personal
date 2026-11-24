'use client';

import { useEffect, useState, useTransition } from 'react';
import { LoaderCircle, Wallet } from 'lucide-react';

/**
 * «Añadir a Apple Wallet» / «Añadir a Google Wallet» de una tarjeta propia.
 *
 * - iPhone/iPad: solo Apple (descarga el .pkpass y el sistema lo abre en Wallet).
 * - Android: solo Google (enlace de guardado que abre la app de Wallet).
 * - Ordenador: los dos (el .pkpass se abre en el Mac o se envía al iPhone).
 *
 * Los botones son negros, con el nombre de la wallet, siguiendo la línea de los
 * distintivos oficiales de Apple y Google.
 */

type Platform = 'ios' | 'android' | 'other';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  // iPadOS se presenta como Mac: se distingue por la pantalla táctil.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'other';
}

const buttonClass =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold text-white shadow-sm outline-offset-2 transition-colors hover:bg-neutral-800 disabled:opacity-60';

export function WalletButtons({
  appleHref,
  apple,
  google,
  loadGoogleUrl,
}: {
  appleHref: string;
  apple: boolean;
  google: boolean;
  loadGoogleUrl: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
}) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPlatform(detectPlatform()), []);

  const showApple = apple && platform !== 'android';
  const showGoogle = google && platform !== 'ios';
  if (platform === null || (!showApple && !showGoogle)) return null;

  const addToGoogle = () => {
    setError(null);
    startTransition(async () => {
      const result = await loadGoogleUrl();
      if (result.ok) window.location.href = result.url;
      else setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {showApple && (
          // Enlace normal (no <Link>): el navegador tiene que descargar el .pkpass.
          <a href={appleHref} className={buttonClass}>
            <Wallet aria-hidden className="size-4" /> Añadir a Apple Wallet
          </a>
        )}
        {showGoogle && (
          <button type="button" onClick={addToGoogle} disabled={pending} aria-busy={pending} className={buttonClass}>
            {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Wallet aria-hidden className="size-4" />} Añadir a Google Wallet
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
