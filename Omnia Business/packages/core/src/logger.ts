/**
 * Logger estructurado mínimo: una línea JSON por evento en stdout/stderr.
 *
 * Vercel, Datadog, Loki o CloudWatch indexan los campos sin configurar nada, así
 * que en producción se puede filtrar por `requestId`, `orgIds` o `code`. Sin
 * dependencias a propósito: si un día hace falta pino, se cambia aquí y nada más.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[(process.env.LOG_LEVEL as Level | undefined) ?? 'info'] ?? LEVELS.info;

/** Los Error no se serializan con JSON.stringify: se extrae lo útil (y la causa). */
function serializeError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const pg = error as Error & { code?: string; detail?: string; cause?: unknown };
  return {
    name: error.name,
    message: error.message,
    ...(pg.code ? { code: pg.code } : {}),
    ...(pg.detail ? { detail: pg.detail } : {}),
    stack: error.stack,
    ...(pg.cause ? { cause: serializeError(pg.cause) } : {}),
  };
}

function write(level: Level, msg: string, fields: Fields) {
  if (LEVELS[level] < minLevel) return;
  const { error, ...rest } = fields;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg,
    ...rest,
    ...(error !== undefined ? { error: serializeError(error) } : {}),
  });
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  /** Logger hijo con campos fijos, p. ej. `logger.child({ requestId })`. */
  child(fields: Fields): Logger;
}

function create(base: Fields): Logger {
  return {
    debug: (msg, f = {}) => write('debug', msg, { ...base, ...f }),
    info: (msg, f = {}) => write('info', msg, { ...base, ...f }),
    warn: (msg, f = {}) => write('warn', msg, { ...base, ...f }),
    error: (msg, f = {}) => write('error', msg, { ...base, ...f }),
    child: (f) => create({ ...base, ...f }),
  };
}

export const logger = create({});
