export type DomainErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'INVALID_STATE'
  | 'INSUFFICIENT_STOCK'
  /** La sociedad no tiene contratado el módulo (no depende del rol de la persona). */
  | 'FEATURE_DISABLED';

/**
 * Error de negocio con un código estable. La capa HTTP lo traduce a un estado;
 * el mensaje está pensado para mostrarse al usuario.
 */
export class DomainError extends Error {
  override readonly name = 'DomainError';

  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const isDomainError = (error: unknown): error is DomainError => error instanceof DomainError;
