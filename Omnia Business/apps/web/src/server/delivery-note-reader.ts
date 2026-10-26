import 'server-only';
import { readFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { DomainError } from '@omnia/core';
import { DeliveryNoteExtraction } from '@omnia/inventory';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
export const SCAN_ACCEPT = [...IMAGE_TYPES, 'application/pdf'].join(',');
export const SCAN_MAX_BYTES = 7 * 1024 * 1024;

const PROMPT = `Es la foto o el PDF de un albarán de entrega que un proveedor ha dejado en nuestro almacén.
Transcribe sus datos tal como aparecen, sin inventar nada:
- El proveedor es quien emite el albarán (membrete, logotipo, pie con razón social). Ignora los datos del cliente o del destinatario de la mercancía.
- Una línea por artículo servido. Si hay columnas de cantidad pedida y servida, usa la servida. Omite portes, subtotales y líneas de texto sin artículo.
- Los números van con punto decimal (en el papel suelen ir con coma: «1.250,50» es 1250.5).
- Si un dato no aparece o no se lee con seguridad, devuelve null en lugar de suponerlo.
- Si la imagen no es un albarán o es ilegible, marca isDeliveryNote como false.`;

// Solo pruebas E2E: una lectura grabada en JSON en lugar de llamar a la API.
const fixture = process.env.NODE_ENV !== 'production' ? process.env.OMNIA_SCAN_FIXTURE : undefined;

export const scanConfigured = () => Boolean(fixture || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client: Anthropic | undefined;

/** Lee un albarán con Claude (visión + salida estructurada validada con Zod). */
export async function readDeliveryNote(file: File): Promise<DeliveryNoteExtraction> {
  if (!scanConfigured()) {
    throw new DomainError('INVALID_STATE', 'La lectura de fotos no está configurada: falta la clave de la API de Claude (ANTHROPIC_API_KEY).');
  }
  const isPdf = file.type === 'application/pdf';
  if (!isPdf && !IMAGE_TYPES.includes(file.type as ImageType)) {
    throw new DomainError('VALIDATION', 'Sube una foto (JPG, PNG, WebP) o un PDF del albarán');
  }
  if (file.size > SCAN_MAX_BYTES) throw new DomainError('VALIDATION', 'El archivo pesa más de 7 MB: haz la foto con menos resolución o divide el PDF');

  if (fixture) return DeliveryNoteExtraction.parse(JSON.parse(await readFile(fixture, 'utf8')));

  const data = Buffer.from(await file.arrayBuffer()).toString('base64');
  client ??= new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // Si un clasificador de seguridad rechazara la petición, la API la reintenta con otro modelo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(DeliveryNoteExtraction) },
      messages: [
        {
          role: 'user',
          content: [
            isPdf
              ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
              : { type: 'image', source: { type: 'base64', media_type: file.type as ImageType, data } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new DomainError('INVALID_STATE', 'No se ha podido leer el albarán. Prueba con otra foto o regístralo a mano.');
    }
    return response.parsed_output;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (error instanceof Anthropic.AuthenticationError) {
      throw new DomainError('INVALID_STATE', 'La clave de la API de Claude no es válida. Revisa ANTHROPIC_API_KEY.');
    }
    if (error instanceof Anthropic.RateLimitError || (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500)) {
      throw new DomainError('INVALID_STATE', 'El servicio de lectura está saturado ahora mismo. Inténtalo en un minuto o regístralo a mano.');
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new DomainError('INVALID_STATE', 'Sin conexión con el servicio de lectura. Regístralo a mano o inténtalo después.');
    }
    throw error;
  }
}
