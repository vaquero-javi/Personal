'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { Maximize2, X } from 'lucide-react';

/**
 * Tarjeta de empleado en pantalla: una tarjeta física (proporción ISO/IEC 7810
 * ID-1, la de una tarjeta bancaria: 85,6 × 54 mm) hecha de cristal, con un QR
 * dinámico que cambia cada 30 segundos.
 *
 * Excepción documentada en DESIGN.md: igual que el lomo, la tarjeta es un objeto
 * físico, no una casilla de la hoja. Por eso vive sobre su propio escenario y
 * puede tener profundidad, desenfoque, brillo y una leve inclinación 3D.
 *
 * Toda la cara de la tarjeta se mide en unidades de contenedor (cqw): se pinta
 * igual en la página y ampliada a pantalla completa.
 */

export interface StaffCardView {
  id: string;
  wallet: 'apple' | 'google';
  holderName: string;
  roleName: string;
  orgName: string;
  discountPct: string | null;
}

type QrResult = { qr: string; wallet: 'apple' | 'google'; refreshInSeconds: number | null };
type QrState = { svg: string | null; error: string | null; secondsLeft: number | null };

/** QR del servidor; el dinámico se pide de nuevo al caducar. */
function useCardQr(loadQr: () => Promise<QrResult>): QrState {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const result = await loadQr();
        if (cancelled) return;
        setSvg(await QRCode.toString(result.qr, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#16181d', light: '#ffffff' } }));
        setError(null);
        if (result.refreshInSeconds !== null) {
          setSecondsLeft(result.refreshInSeconds);
          timer = setTimeout(refresh, result.refreshInSeconds * 1000 + 300);
        }
      } catch {
        if (!cancelled) setError('No se pudo cargar el QR');
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loadQr]);

  const rotating = secondsLeft !== null;
  useEffect(() => {
    if (!rotating) return;
    const tick = setInterval(() => setSecondsLeft((s) => (s === null || s <= 1 ? s : s - 1)), 1000);
    return () => clearInterval(tick);
  }, [rotating]);

  return { svg, error, secondsLeft };
}

export function StaffCard({ card, loadQr }: { card: StaffCardView; loadQr: () => Promise<QrResult> }) {
  const qr = useCardQr(loadQr);
  const [expanded, setExpanded] = useState(false);
  const tilt = useTilt();

  return (
    <>
      <Stage className="rounded-3xl px-4 py-10 sm:px-10 sm:py-14">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={`Tarjeta de empleado de ${card.holderName}. Toca para verla a pantalla completa`}
          {...tilt.handlers}
          style={tilt.style}
          className="group w-full max-w-[26rem] cursor-zoom-in rounded-[4.6%/7.3%] outline-offset-4 [transform-style:preserve-3d] motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
        >
          <CardFace card={card} qr={qr} hint="Ampliar" />
        </button>
      </Stage>
      {expanded && <ExpandedCard card={card} qr={qr} onClose={() => setExpanded(false)} />}
    </>
  );
}

/**
 * Fondo oscuro con las luces que el cristal desenfoca. A pantalla completa las
 * luces se miden con la pantalla (vmax): si no, quedarían pequeñas en las esquinas
 * y la tarjeta se vería gris.
 */
function Stage({ className = '', fullscreen = false, children }: { className?: string; fullscreen?: boolean; children: ReactNode }) {
  const lights = fullscreen
    ? ['-left-[12vmax] -top-[14vmax] size-[55vmax] blur-[12vmax]', '-bottom-[18vmax] -right-[14vmax] size-[65vmax] blur-[14vmax]', 'left-[40%] top-[30%] size-[32vmax] blur-[10vmax]']
    : ['-left-20 -top-24 size-80 blur-[90px]', '-bottom-32 -right-24 size-96 blur-[110px]', 'left-1/2 top-1/3 size-56 blur-[80px]'];
  return (
    <div className={`relative isolate flex items-center justify-center overflow-hidden bg-[#0f1116] [perspective:1200px] ${className}`}>
      <div aria-hidden className={`pointer-events-none absolute rounded-full bg-[#ffb547] opacity-55 ${lights[0]}`} />
      <div aria-hidden className={`pointer-events-none absolute rounded-full bg-[#7c5cff] opacity-55 ${lights[1]}`} />
      <div aria-hidden className={`pointer-events-none absolute rounded-full bg-[#21c7a8] opacity-30 ${lights[2]}`} />
      {children}
    </div>
  );
}

/** La cara de la tarjeta. Ocupa el ancho que le den; todo dentro escala con él. */
function CardFace({ card, qr, hint }: { card: StaffCardView; qr: QrState; hint?: string }) {
  const discount = card.discountPct ? `−${Number(card.discountPct).toLocaleString('es-ES')} %` : null;
  const number = card.id.replace(/-/g, '').slice(-8).toUpperCase();
  return (
    <span className="relative block aspect-[85.6/54] w-full overflow-hidden rounded-[4.6%/7.3%] border border-white/30 bg-white/[0.09] text-left text-white shadow-[0_30px_70px_-20px_rgba(0,0,0,0.75),0_8px_20px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl backdrop-saturate-150 [container-type:inline-size]">
      {/* Reflejo superior del cristal. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[55%] bg-gradient-to-b from-white/[0.22] to-transparent" />
      {/* Brillo holográfico que sigue al puntero. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 mix-blend-overlay transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: 'radial-gradient(circle at var(--glare-x, 30%) var(--glare-y, 20%), rgba(255,255,255,0.55), transparent 45%), linear-gradient(115deg, transparent 30%, rgba(255,214,102,0.35) 45%, rgba(124,92,255,0.35) 55%, transparent 70%)' }}
      />

      <span className="relative grid h-full grid-cols-[minmax(0,1fr)_auto] gap-[4cqw] p-[5.5cqw]">
        {/* Columna de datos */}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[2.9cqw] font-semibold uppercase tracking-[0.18em] text-white/75">{card.orgName}</span>
          <span className="truncate whitespace-nowrap text-[3.1cqw] text-white/70">Tarjeta de empleado</span>

          <span className="mt-[4cqw] flex items-center gap-[2.5cqw]">
            <Chip />
            {discount ? (
              <span className="whitespace-nowrap rounded-full border border-white/35 bg-white/15 px-[0.55em] py-[0.08em] text-[4.6cqw] font-bold tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] backdrop-blur-md">
                {discount}
              </span>
            ) : (
              <span className="text-[3cqw] text-white/70">Sin descuento</span>
            )}
          </span>

          <span className="mt-auto flex flex-col">
            {/* Nombre «en relieve», como en una tarjeta grabada. */}
            <span className="truncate text-[4.8cqw] font-bold uppercase tracking-[0.06em] [text-shadow:0_1px_0_rgba(255,255,255,0.25),0_-1px_0_rgba(0,0,0,0.45)]">
              {card.holderName}
            </span>
            <span className="flex items-center gap-[1.5cqw] text-[2.9cqw] text-white/70">
              <span className="truncate">{card.roleName}</span>
              <span aria-hidden>·</span>
              <span className="font-mono tracking-[0.12em]">•••• {number}</span>
            </span>
          </span>
        </span>

        {/* Columna del QR */}
        <span className="flex h-full flex-col items-center justify-between">
          <span className="block aspect-square w-[36cqw] rounded-[3.5cqw] bg-white p-[2.4cqw] shadow-[0_6px_18px_rgba(0,0,0,0.35)]">
            {qr.svg ? (
              // SVG generado por la librería qrcode a partir de un texto controlado (OMN1:…).
              <span className="block aspect-square w-full [&>svg]:h-full [&>svg]:w-full" role="img" aria-label="Código QR de la tarjeta" dangerouslySetInnerHTML={{ __html: qr.svg }} />
            ) : (
              <span className="flex aspect-square w-full items-center justify-center text-center text-[2.6cqw] leading-tight text-ink-3">{qr.error ?? 'Cargando…'}</span>
            )}
          </span>
          <span className="flex items-center gap-[1cqw] whitespace-nowrap text-[2.8cqw] tabular-nums text-white/75">
            {qr.secondsLeft !== null ? (
              <>
                <CountdownRing seconds={qr.secondsLeft} /> {qr.secondsLeft}&nbsp;s
              </>
            ) : hint ? (
              <>
                <Maximize2 className="size-[2.8cqw]" aria-hidden /> {hint}
              </>
            ) : null}
          </span>
        </span>
      </span>
    </span>
  );
}

/**
 * La tarjeta entera a pantalla completa, lo más grande que quepa. En una pantalla
 * en vertical (un móvil) se gira 90° para aprovechar el alto: así el QR sale
 * mucho más grande y los lectores lo leen igual girado.
 */
function ExpandedCard({ card, qr, onClose }: { card: StaffCardView; qr: QrState; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(orientation: portrait)');
    const update = () => setPortrait(media.matches);
    update();
    media.addEventListener('change', update);
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // La página de detrás no se desplaza mientras está abierta.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Lado largo de la tarjeta: lo máximo que quepa con un margen, en cada orientación.
  const width = portrait ? 'min(88dvh, calc(92vw * 85.6 / 54))' : 'min(92vw, calc(84dvh * 85.6 / 54))';

  return (
    <div role="dialog" aria-modal="true" aria-label={`Tarjeta de empleado de ${card.holderName}`} className="fixed inset-0 z-50">
      <Stage className="size-full" fullscreen>
        <div onClick={onClose} aria-hidden className="absolute inset-0" />
        <div className="pointer-events-none relative shrink-0" style={{ width, transform: portrait ? 'rotate(90deg)' : undefined }}>
          <CardFace card={card} qr={qr} />
        </div>
        <button
          ref={close}
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-md hover:bg-white/20"
        >
          <X className="size-5" aria-hidden />
        </button>
        <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-white/70">Sube el brillo y acerca el QR al lector</p>
      </Stage>
    </div>
  );
}

/** Inclinación 3D leve siguiendo el puntero (nada con pantalla táctil ni con menos movimiento). */
function useTilt() {
  const [style, setStyle] = useState<CSSProperties>({});
  const reduce = useRef(false);
  useEffect(() => {
    reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    if (reduce.current || e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setStyle({
      transform: `rotateX(${(0.5 - y) * 10}deg) rotateY(${(x - 0.5) * 12}deg)`,
      ['--glare-x' as string]: `${x * 100}%`,
      ['--glare-y' as string]: `${y * 100}%`,
    });
  }, []);
  const onPointerLeave = useCallback(() => setStyle({}), []);
  return { style, handlers: { onPointerMove, onPointerLeave } };
}

/** Chip de contacto, dorado y translúcido. */
function Chip() {
  return (
    <svg viewBox="0 0 40 30" className="w-[9cqw] shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]" aria-hidden>
      <defs>
        <linearGradient id="chip-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6dc93" />
          <stop offset="0.5" stopColor="#d4a84b" />
          <stop offset="1" stopColor="#f3d58a" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="39" height="29" rx="5" fill="url(#chip-gold)" fillOpacity="0.85" stroke="rgba(255,255,255,0.5)" />
      <path d="M0.5 10.5h12m15 0h12M0.5 19.5h12m15 0h12M12.5 0.5v29m15-29v29M12.5 15h15" fill="none" stroke="rgba(90,62,10,0.45)" strokeWidth="1" />
    </svg>
  );
}

function CountdownRing({ seconds, total = 30 }: { seconds: number; total?: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 18 18" className="size-[3.2cqw] -rotate-90" aria-hidden>
      <circle cx="9" cy="9" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" />
      <circle cx="9" cy="9" r={r} fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - seconds / total)} className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-1000 motion-safe:ease-linear" />
    </svg>
  );
}
