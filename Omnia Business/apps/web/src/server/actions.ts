import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { ZodError } from 'zod';
import { isDomainError } from '@omnia/core';
import { mapPgError } from '@omnia/db';

export interface ActionState {
  ok?: boolean;
  /** Cambia en cada éxito: permite reiniciar el formulario. */
  nonce?: number;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Envoltorio de todas las Server Actions: traduce los errores de dominio, de
 * Zod y de Postgres a un estado que el formulario sabe mostrar. `redirect()` y
 * `notFound()` se relanzan tal cual.
 */
export async function runAction(work: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await work();
    return { ok: true, nonce: Date.now(), ...(message ? { message } : {}) };
  } catch (raw) {
    unstable_rethrow(raw);
    const error = mapPgError(raw);
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = issue.path.join('.');
        fieldErrors[key] ??= issue.message;
      }
      return { error: 'Revisa los campos marcados', fieldErrors };
    }
    if (isDomainError(error)) {
      const issues = (error.details as { issues?: { path: (string | number)[]; message: string }[] } | undefined)?.issues;
      const fieldErrors = issues ? Object.fromEntries(issues.map((i) => [`customFields.${i.path.join('.')}`, i.message])) : undefined;
      return { error: error.message, ...(fieldErrors ? { fieldErrors } : {}) };
    }
    console.error(raw);
    return { error: 'Algo ha fallado. Inténtalo de nuevo y, si persiste, avisa a soporte.' };
  }
}

/** FormData → objeto plano. `lines` (JSON) y casillas («on») se normalizan. */
export function formObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('$ACTION')) continue;
    if (typeof value !== 'string') continue;
    if (key === 'lines' || key.endsWith('Json')) {
      out[key.replace(/Json$/, '')] = value ? JSON.parse(value) : [];
    } else if (key in out) {
      out[key] = ([] as unknown[]).concat(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export const flag = (formData: FormData, key: string) => formData.get(key) === 'on' || formData.get(key) === 'true';
