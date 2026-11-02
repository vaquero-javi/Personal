import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { ZodError } from 'zod';
import { isDomainError } from '@omnia/core';
import { mapPgError } from '@omnia/db';

export type Result<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };

/** Traduce errores de dominio, Zod y Postgres a un mensaje que el terminal sabe mostrar. */
export async function run<T>(work: () => Promise<T>, message?: string): Promise<Result<T>> {
  try {
    const data = await work();
    return { ok: true, data, ...(message ? { message } : {}) };
  } catch (raw) {
    unstable_rethrow(raw);
    const error = mapPgError(raw);
    if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message ?? 'Revisa los datos' };
    if (isDomainError(error)) return { ok: false, error: error.message };
    console.error(raw);
    return { ok: false, error: 'Algo ha fallado. Inténtalo de nuevo.' };
  }
}
