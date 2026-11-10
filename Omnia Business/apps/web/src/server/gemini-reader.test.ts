import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SupplierInvoiceExtraction } from '@omnia/purchasing';

vi.mock('server-only', () => ({}));
const { readWithGemini, toGeminiSchema } = await import('./gemini-reader');

const invoice = {
  isInvoice: true,
  supplierName: 'Cervezas del Norte S.A.',
  supplierTaxId: 'A48112233',
  invoiceNumber: 'TN-F-2026-1302',
  date: '2026-11-05',
  lines: [{ reference: null, barcode: null, description: 'Refresco cola lata 33 cl caja 24', quantity: 1, unitPrice: 8.9, discountPct: null, taxRate: 10 }],
};

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

const read = () => readWithGemini({ data: 'QUJD', mimeType: 'application/pdf' }, { schema: SupplierInvoiceExtraction, prompt: 'Lee la factura', what: 'la factura' });

afterEach(() => vi.unstubAllGlobals());

describe('esquema para Gemini', () => {
  it('pasa los anulables a type: [x, "null"] y quita lo que Gemini no admite', () => {
    const schema = toGeminiSchema(z.toJSONSchema(SupplierInvoiceExtraction)) as any;
    expect(schema.$schema).toBeUndefined();
    expect(schema.additionalProperties).toBeUndefined();
    expect(schema.properties.supplierName).toMatchObject({ type: ['string', 'null'], description: expect.any(String) });
    expect(schema.properties.lines.items.properties.unitPrice.type).toEqual(['number', 'null']);
    expect(schema.properties.lines.items.additionalProperties).toBeUndefined();
    expect(JSON.stringify(schema)).not.toContain('anyOf');
  });
});

describe('lectura con Gemini', () => {
  it('envía el PDF como documento y valida la respuesta', async () => {
    const fetch = reply(200, { steps: [{ type: 'thought' }, { content: [{ type: 'text', text: JSON.stringify(invoice) }] }] });
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('GEMINI_API_KEY', 'clave-de-prueba');
    await expect(read()).resolves.toEqual(invoice);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/v1beta/interactions');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('clave-de-prueba');
    const body = JSON.parse(init.body as string);
    expect(body.input[0]).toEqual({ type: 'document', data: 'QUJD', mime_type: 'application/pdf' });
    expect(body.response_format).toMatchObject({ mime_type: 'application/json', schema: { type: 'object' } });
  });

  it('también lee la respuesta en output_text', async () => {
    vi.stubGlobal('fetch', reply(200, { output_text: JSON.stringify(invoice) }));
    await expect(read()).resolves.toMatchObject({ invoiceNumber: 'TN-F-2026-1302' });
  });

  it('si un modelo está saturado (503), prueba con el siguiente', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":{"code":"service_unavailable"}}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(invoice) }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(read()).resolves.toMatchObject({ invoiceNumber: 'TN-F-2026-1302' });
    const models = fetch.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).model);
    expect(models).toEqual(['gemini-3.8-flash', 'gemini-3.6-flash']);
  });

  it('si un modelo no contesta a tiempo, también pasa al siguiente', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(invoice) }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(read()).resolves.toMatchObject({ isInvoice: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('si todos están saturados, lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    await expect(read()).rejects.toThrow(/saturados/);
  });

  it('explica el límite gratuito, la clave mala y las respuestas que no cuadran', async () => {
    vi.stubGlobal('fetch', reply(429, 'RESOURCE_EXHAUSTED'));
    await expect(read()).rejects.toThrow(/límite gratuito/);
    vi.stubGlobal('fetch', reply(400, '{"error":{"message":"API key not valid"}}'));
    await expect(read()).rejects.toThrow(/GEMINI_API_KEY/);
    vi.stubGlobal('fetch', reply(200, { output_text: '{"isInvoice": "quizá"}' }));
    await expect(read()).rejects.toThrow(/No se ha podido leer la factura/);
  });
});
