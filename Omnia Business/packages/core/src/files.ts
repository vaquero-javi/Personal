import { DomainError } from './errors';

// Archivos que la gente sube (fotos de albaranes, nóminas…): el tipo se decide
// por la firma de los bytes, sin fiarse de la extensión ni del navegador.

export type FileType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'application/pdf';

export const MAX_UPLOAD_BYTES = 7 * 1024 * 1024;

export interface StoredFile<T extends FileType = FileType> {
  fileName: string;
  contentType: T;
  content: Uint8Array;
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte);

export function sniffFileType(bytes: Uint8Array): FileType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}

/** Valida un archivo subido (vacío, tamaño, tipo real) y limpia su nombre. */
export function toStoredFile<T extends FileType>(
  fileName: string,
  content: Uint8Array,
  { allowed, what, fallbackName }: { allowed: readonly T[]; what: string; fallbackName: string },
): StoredFile<T> {
  if (content.byteLength === 0) throw new DomainError('VALIDATION', `El archivo ${what} está vacío`);
  if (content.byteLength > MAX_UPLOAD_BYTES) throw new DomainError('VALIDATION', `El archivo ${what} pesa más de 7 MB`);
  const contentType = sniffFileType(content);
  if (!contentType || !(allowed as readonly FileType[]).includes(contentType)) {
    const kinds = allowed.map((t) => (t === 'application/pdf' ? 'PDF' : t.slice(6).toUpperCase().replace('JPEG', 'JPG').replace('WEBP', 'WebP')));
    throw new DomainError('VALIDATION', `El archivo ${what} tiene que ser ${kinds.slice(0, -1).join(', ')}${kinds.length > 1 ? ' o ' : ''}${kinds.at(-1)}`);
  }
  const name = fileName.replace(/[\\/\p{Cc}]/gu, '').trim().slice(-200) || fallbackName;
  return { fileName: name, contentType: contentType as T, content };
}
