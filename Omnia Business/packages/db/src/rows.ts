type Camel<S extends string> = S extends `${infer H}_${infer T}` ? `${H}${Capitalize<Camel<T>>}` : S;
export type Camelized<T> = { [K in keyof T as K extends string ? Camel<K> : K]: T[K] };

const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Filas de Postgres (snake_case) a objetos de dominio (camelCase). */
export function camelize<T extends object>(row: T): Camelized<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) out[toCamel(key)] = value;
  return out as Camelized<T>;
}

export const camelizeAll = <T extends object>(rows: readonly T[]) => rows.map(camelize);

/** Atajo para servicios: filas camelizadas con el tipo de dominio declarado. */
export const asRows = <T>(rows: readonly object[]): T[] => rows.map((row) => camelize(row)) as T[];
export const asRow = <T>(rows: readonly object[]): T | undefined => asRows<T>(rows)[0];
