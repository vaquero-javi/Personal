'use client';

import { useRef, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useEntitlements, useFeature, useHiddenFeature, useMissingFeature } from '@/lib/entitlements';
import { ModuleLocked } from './module-locked';

export type FeatureGateMode = 'hide' | 'upsell';

/**
 * Envoltorio de cualquier elemento que dependa de un módulo contratado.
 *
 *  - mode="hide":   si la sociedad no lo tiene, no se pinta (ni en el DOM ni en la navegación).
 *  - mode="upsell": se pinta atenuado e inerte, con un candado y «Pro»; al pulsarlo
 *                   se abre la hoja de «módulo no contratado» con la solicitud de activación.
 *
 * Es solo interfaz: la ruta (RequireFeature), la API (handle({ feature })) y la
 * RLS siguen negando el acceso aunque alguien quite este envoltorio.
 */
export function FeatureGate({
  feature,
  mode = 'hide',
  fallback = null,
  badge = 'Pro',
  as,
  compact = false,
  children,
}: {
  feature: string;
  mode?: FeatureGateMode;
  /** Qué pintar en modo hide cuando no hay acceso (por defecto, nada). */
  fallback?: ReactNode;
  badge?: string;
  /**
   * Elemento envoltorio, siempre el mismo con o sin acceso. En listas, `as="li"`:
   * así el modo hide no deja un <li> vacío y el upsell no mete un <div> en el <ul>.
   */
  as?: 'li' | 'div';
  /**
   * Para huecos estrechos (pestañas): en vez de la etiqueta «Pro» encima del
   * elemento, un candado pequeño justo a su derecha, en su propio espacio.
   */
  compact?: boolean;
  children: ReactNode;
}) {
  const { hasAccess, isLoading } = useFeature(feature);
  const hidden = useHiddenFeature(feature);
  // Mientras se resuelve no se enseña ni el elemento ni el candado: nada de parpadeos.
  if (isLoading) return mode === 'hide' ? fallback : null;
  if (hasAccess) {
    const Wrapper = as;
    return Wrapper ? <Wrapper>{children}</Wrapper> : children;
  }
  // Oculto por Omnia: como si no existiera, también para quien gestiona la sociedad.
  if (mode === 'hide' || hidden) return fallback;
  return (
    <Upsell feature={feature} badge={badge} as={as ?? 'div'} compact={compact}>
      {children}
    </Upsell>
  );
}

function Upsell({ feature, badge, as: Wrapper, compact, children }: { feature: string; badge: string; as: 'li' | 'div'; compact: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { active, catalog } = useEntitlements();
  const missing = useMissingFeature(feature);
  const requested = catalog.get(feature);
  if (!active || !missing) return null;

  const close = () => dialog.current?.close();
  return (
    <Wrapper className={compact ? 'relative flex items-center' : 'relative block'}>
      {/* inert: fuera del orden de tabulación y sin clics; el botón de encima es lo único interactivo. */}
      <div inert className="opacity-55 select-none">
        {children}
      </div>
      {/* Compacto: el candado ocupa su propio sitio, a la derecha del texto; nunca encima. */}
      {compact && <Lock aria-hidden className="-ml-2 mr-2.5 size-3.5 shrink-0 text-ink-3" strokeWidth={2.4} />}
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-haspopup="dialog"
        aria-label={`${requested?.name ?? missing.name}: módulo no contratado. Ver cómo activarlo`}
        title={compact ? `${badge}: módulo no contratado` : undefined}
        className={`pressable absolute inset-0 flex items-center justify-end ${compact ? 'rounded-[8px]' : 'rounded-[9px] pr-2'} focus-visible:ring-[3px] focus-visible:ring-tint/40 focus-visible:outline-none`}
      >
        {!compact && (
          <span className="inline-flex items-center gap-1 rounded-full bg-fill-strong px-2 py-0.5 text-[11px] font-semibold text-ink-2">
            <Lock aria-hidden className="size-3" strokeWidth={2.4} />
            {badge}
          </span>
        )}
      </button>
      <dialog
        ref={dialog}
        aria-label={`Módulo no contratado: ${missing.name}`}
        onClick={(e) => e.target === e.currentTarget && close()}
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[22px] bg-sheet p-6 pt-8 text-ink shadow-[var(--shadow-float)] backdrop:bg-black/30 open:animate-[sheet-pop_280ms_var(--ease-spring)] open:backdrop:animate-[scrim-in_250ms_ease]"
      >
        <ModuleLocked
          variant="dialog"
          organizationId={active.id}
          feature={missing}
          requested={requested && requested.code !== missing.code ? requested : undefined}
          canRequest={active.canRequest}
          onClose={close}
        />
      </dialog>
    </Wrapper>
  );
}
