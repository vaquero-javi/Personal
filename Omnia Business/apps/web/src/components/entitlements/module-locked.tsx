'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { CircleCheck, Lock } from 'lucide-react';
import { buttonClass } from '@/components/ui/button-styles';
import { inputClass } from '@/components/ui/form';

export interface LockedFeature {
  code: string;
  name: string;
  description: string;
}

type RequestState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

/**
 * Lo que se ve en lugar de un módulo no contratado: qué es, por qué no está
 * y cómo conseguirlo. Quien gestiona la sociedad (org.manage) puede pedir la
 * activación a Omnia; el resto sabe a quién acudir. No depende del rol: es el
 * plan de la sociedad.
 */
export function ModuleLocked({
  organizationId,
  feature,
  requested,
  canRequest,
  variant = 'page',
  onClose,
}: {
  organizationId: string;
  /** El módulo que hay que activar (el primero que falta de la cadena). */
  feature: LockedFeature;
  /** Lo que la persona intentaba abrir, si es un submódulo de `feature`. */
  requested?: LockedFeature;
  canRequest: boolean;
  variant?: 'page' | 'dialog';
  onClose?: () => void;
}) {
  const router = useRouter();
  const messageId = useId();
  const [message, setMessage] = useState('');
  const [state, setState] = useState<RequestState>({ kind: 'idle' });

  async function submit() {
    setState({ kind: 'sending' });
    try {
      const response = await fetch('/api/v1/entitlements/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-organization-id': organizationId },
        body: JSON.stringify({ featureCode: feature.code, ...(message.trim() ? { message: message.trim() } : {}) }),
      });
      if (response.ok) return setState({ kind: 'sent' });
      const problem = (await response.json().catch(() => null)) as { code?: string; detail?: string } | null;
      if (problem?.code === 'INVALID_STATE') {
        // Ya estaba activo (alguien lo activó mientras tanto): basta con repintar.
        router.refresh();
        onClose?.();
        return;
      }
      setState({ kind: 'error', message: problem?.detail ?? 'No se ha podido enviar la solicitud' });
    } catch {
      setState({ kind: 'error', message: 'Sin conexión. Inténtalo de nuevo.' });
    }
  }

  const page = variant === 'page';
  return (
    <div className={page ? 'flex flex-col items-center px-6 py-16 text-center md:py-20' : 'flex flex-col items-center px-1 text-center'}>
      <span aria-hidden className="mb-4 flex size-14 items-center justify-center rounded-[16px] bg-fill text-ink-3">
        <Lock className="size-7" strokeWidth={1.8} />
      </span>
      <p className="text-[13px] font-semibold text-ink-3">Módulo no contratado</p>
      <h2 className={`${page ? 'text-[26px]' : 'text-[22px]'} mt-0.5 leading-tight font-bold tracking-[-0.02em]`}>{requested?.name ?? feature.name}</h2>
      <p className="mt-2 max-w-md text-[15px] text-ink-2">{requested?.description || feature.description}</p>
      {requested && requested.code !== feature.code && (
        <p className="mt-2 max-w-md text-[14px] text-ink-3">
          Forma parte de <b className="font-semibold text-ink-2">{feature.name}</b>, que tu sociedad no tiene activo.
        </p>
      )}

      <div className="mt-6 w-full max-w-sm">
        {state.kind === 'sent' ? (
          <p role="status" className="flex items-start gap-2.5 rounded-[12px] bg-ok-soft px-3.5 py-3 text-left text-[14px] text-ok">
            <CircleCheck aria-hidden className="mt-px size-[18px] shrink-0" />
            <span>
              <b className="font-semibold">Solicitud enviada.</b> El equipo de Omnia la verá en su panel y activará el módulo; aparecerá aquí sin recargar.
            </span>
          </p>
        ) : canRequest ? (
          <form
            className="flex flex-col gap-3 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label htmlFor={messageId} className="text-[13px] text-ink-2">
              Mensaje para Omnia <span className="text-ink-3">(opcional)</span>
            </label>
            <textarea
              id={messageId}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Para cuándo lo necesitas, cuántas personas lo usarán…"
              className={`${inputClass} h-auto resize-none py-2`}
            />
            {state.kind === 'error' && (
              <p role="alert" className="text-[13px] text-danger">
                {state.message}
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              {onClose && (
                <button type="button" onClick={onClose} className={buttonClass('secondary')}>
                  Ahora no
                </button>
              )}
              <button type="submit" disabled={state.kind === 'sending'} className={buttonClass('primary')}>
                {state.kind === 'sending' ? 'Enviando…' : 'Solicitar activación'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-[14px] text-ink-3">Pide a quien administra la sociedad que solicite el módulo a Omnia.</p>
            {onClose && (
              <button type="button" onClick={onClose} className={buttonClass('secondary', 'mt-4')}>
                Entendido
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
