'use client';

import { useState, useTransition } from 'react';
import { Wallet } from 'lucide-react';
import { buttonClass } from '@/components/ui/button-styles';
import { flash } from '@/components/ui/form';

/**
 * «Añadir a Apple Wallet / Google Wallet». Sin certificados configurados el botón
 * se ve desactivado con el motivo: la tarjeta sigue sirviendo en pantalla.
 */
export function WalletButtons({
  wallet,
  appleHref,
  appleReady,
  googleReady,
  googleLink,
}: {
  wallet: 'apple' | 'google';
  appleHref: string;
  appleReady: boolean;
  googleReady: boolean;
  googleLink: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
}) {
  const [pending, start] = useTransition();
  const [hint, setHint] = useState<string | null>(null);

  if (wallet === 'apple') {
    return appleReady ? (
      <a href={appleHref} className={buttonClass('primary', 'w-full justify-center')}>
        <Wallet className="size-4" aria-hidden /> Añadir a Apple Wallet
      </a>
    ) : (
      <Unavailable label="Añadir a Apple Wallet" reason="Falta configurar Apple Wallet (certificado del Pass Type ID). Mientras, enseña la tarjeta en pantalla." />
    );
  }

  if (!googleReady) {
    return <Unavailable label="Añadir a Google Wallet" reason="Falta configurar Google Wallet (cuenta de emisor). Mientras, enseña la tarjeta en pantalla." />;
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        className={buttonClass('primary', 'w-full justify-center')}
        onClick={() =>
          start(async () => {
            const result = await googleLink();
            if (result.ok) window.location.href = result.url;
            else {
              setHint(result.error);
              flash(result.error);
            }
          })
        }
      >
        <Wallet className="size-4" aria-hidden /> {pending ? 'Preparando…' : 'Añadir a Google Wallet'}
      </button>
      {hint && <p className="text-xs text-danger">{hint}</p>}
    </div>
  );
}

function Unavailable({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="flex flex-col gap-1">
      <button type="button" disabled className={buttonClass('secondary', 'w-full justify-center')}>
        <Wallet className="size-4" aria-hidden /> {label}
      </button>
      <p className="text-xs text-ink-3">{reason}</p>
    </div>
  );
}
