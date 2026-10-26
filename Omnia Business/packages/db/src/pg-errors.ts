import postgres from 'postgres';
import { DomainError, isDomainError } from '@omnia/core';

const RETRYABLE = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
]);

export const isRetryable = (error: unknown): boolean =>
  error instanceof postgres.PostgresError && RETRYABLE.has(error.code);

/**
 * Traduce los errores que Postgres usa para hacer cumplir las reglas de negocio
 * (RLS, CHECK, FKs compuestas, triggers OM00x) a errores de dominio.
 * Los mensajes de nuestros RAISE ya están escritos para el usuario; los de
 * restricciones genéricas se sustituyen para no filtrar detalles del esquema.
 */
export function mapPgError(error: unknown): unknown {
  if (isDomainError(error) || !(error instanceof postgres.PostgresError)) return error;

  const constraint = error.constraint_name || undefined;
  switch (error.code) {
    case '23514':
      if (constraint?.startsWith('stock_levels_on_hand')) {
        return new DomainError('INSUFFICIENT_STOCK', 'No hay existencias suficientes', { constraint });
      }
      return new DomainError('VALIDATION', 'Los datos no cumplen las reglas de la entidad', { constraint });
    case '23505':
      return new DomainError('CONFLICT', 'Ya existe un registro con esos datos', { constraint });
    case '23503':
      // Incluye las FKs compuestas (organization_id, id): referencia a otra empresa.
      return new DomainError('VALIDATION', 'Referencia a un registro inexistente en esta organización', { constraint });
    case '42501':
      return new DomainError('FORBIDDEN', 'No tienes permiso para esta operación');
    case 'P0002':
      return new DomainError('NOT_FOUND', error.message);
    case 'OM001':
    case 'OM002':
      return new DomainError('INVALID_STATE', error.message);
    default:
      return error;
  }
}
