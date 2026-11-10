import 'server-only';
import { z } from 'zod';
import { DomainError } from '@omnia/core';

/**
 * Lectura de fotos y PDF con Gemini (Google), alternativa gratuita a Claude:
 * la API de Gemini tiene un plan gratuito con límite de peticiones. Ojo: en el
 * plan gratuito Google puede usar lo enviado para mejorar sus productos.
 *
 * API «Interactions» por REST (sin SDK): https://aistudio.google.com/docs/structured-output
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const API_REVISION = '2026-05-20';
/**
 * Modelos gratuitos por orden de preferencia. Cuando uno va saturado (503) o
 * agota su cupo gratuito (429, que es por modelo), se prueba el siguiente.
 */
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const MODEL_TIMEOUT_MS = 45_000;
const models = () => [...new Set([process.env.GEMINI_MODEL, ...FALLBACK_MODELS].filter((m): m is string => Boolean(m)))];

export const geminiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

type Json = Record<string, unknown>;

/**
 * JSON Schema de Zod al subconjunto que acepta Gemini: los anulables van como
 * `type: ["string", "null"]` y sin `$schema` ni `additionalProperties`.
 */
export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== 'object') return node;
  const { $schema: _s, additionalProperties: _a, anyOf, ...rest } = node as Json;
  const out: Json = {};
  for (const [k, v] of Object.entries(rest)) out[k] = k === 'properties' ? Object.fromEntries(Object.entries(v as Json).map(([p, s]) => [p, toGeminiSchema(s)])) : toGeminiSchema(v);
  if (Array.isArray(anyOf)) {
    const options = anyOf as Json[];
    const nonNull = options.filter((o) => o.type !== 'null');
    if (nonNull.length === 1 && options.length === 2 && typeof nonNull[0]!.type === 'string') {
      return { ...out, ...(toGeminiSchema(nonNull[0]) as Json), type: [nonNull[0]!.type, 'null'] };
    }
    out.anyOf = toGeminiSchema(anyOf);
  }
  return out;
}

/** El texto de la respuesta: el último paso con contenido de texto. */
function responseText(body: Json): string | undefined {
  if (typeof body.output_text === 'string') return body.output_text;
  const steps = (body.steps ?? body.outputs) as Json[] | undefined;
  for (const step of [...(steps ?? [])].reverse()) {
    if (typeof step.text === 'string') return step.text;
    const content = step.content as Json[] | undefined;
    const part = content?.find((c) => typeof c.text === 'string');
    if (part) return part.text as string;
  }
  return undefined;
}

export async function readWithGemini<S extends z.ZodType>(
  { data, mimeType }: { data: string; mimeType: string },
  { schema, prompt, what }: { schema: S; prompt: string; what: string },
): Promise<z.infer<S>> {
  const unreadable = () => new DomainError('INVALID_STATE', `No se ha podido leer ${what}. Prueba con otra foto o regístral${what.startsWith('la') ? 'a' : 'o'} a mano.`);
  const body = (model: string) =>
    JSON.stringify({
      model,
      input: [
        { type: mimeType === 'application/pdf' ? 'document' : 'image', data, mime_type: mimeType },
        { type: 'text', text: prompt },
      ],
      response_format: { type: 'text', mime_type: 'application/json', schema: toGeminiSchema(z.toJSONSchema(schema)) },
    });

  let res: Response | undefined;
  let lastStatus = 0;
  for (const model of models()) {
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY!, 'Api-Revision': API_REVISION },
        body: body(model),
        // Una lectura normal tarda 10-20 s; si un modelo no contesta en 45 s se pasa al siguiente.
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
      console.error(`Gemini ${model}:`, timedOut ? `sin respuesta en ${MODEL_TIMEOUT_MS / 1000} s` : error);
      // Un modelo que no contesta a tiempo suele estar saturado: se prueba el siguiente.
      if (timedOut) {
        lastStatus = 503;
        continue;
      }
      throw new DomainError('INVALID_STATE', 'Sin conexión con el servicio de lectura (Gemini). Regístralo a mano o inténtalo después.');
    }
    if (res.ok) break;
    lastStatus = res.status;
    const detail = await res.text().catch(() => '');
    console.error(`Gemini ${model}: HTTP ${res.status}`, detail.slice(0, 500));
    if (res.status === 401 || res.status === 403 || /API key/i.test(detail)) {
      throw new DomainError('INVALID_STATE', 'La clave de la API de Gemini no es válida. Revisa GEMINI_API_KEY.');
    }
    // Saturado o sin cupo: se prueba con el siguiente modelo. Otro error (petición mal formada): no tiene arreglo reintentando.
    if (res.status !== 429 && res.status < 500) throw unreadable();
    res = undefined;
  }
  if (!res) {
    throw new DomainError(
      'INVALID_STATE',
      lastStatus === 429
        ? 'Se ha alcanzado el límite gratuito de lecturas de Gemini por ahora. Inténtalo más tarde o regístrala a mano.'
        : 'Los servidores de lectura de Google están saturados ahora mismo. Inténtalo en un par de minutos o regístrala a mano.',
    );
  }

  const text = responseText((await res.json()) as Json);
  if (!text) throw unreadable();
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
  } catch {
    // JSON mal formado: se trata como ilegible.
  }
  throw unreadable();
}
