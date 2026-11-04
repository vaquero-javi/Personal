import { describe, expect, it } from 'vitest';
import { isDomainError } from '@omnia/core';
import { InvoiceListQuery, decodeCursor, encodeCursor } from './invoice-list';

const cursor = { draft: false, sortDate: '2026-11-04', createdAt: '2026-11-04T10:15:00.123456+01:00', id: '7c9e6679-7425-40de-944b-e07fc1f90ae7' };

describe('cursor del listado de facturas', () => {
  it('ida y vuelta sin perder los microsegundos', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('admite borradores sin fecha (infinity)', () => {
    const draft = { ...cursor, draft: true, sortDate: 'infinity' };
    expect(decodeCursor(encodeCursor(draft))).toEqual(draft);
  });

  it.each([
    ['basura', 'no-es-base64-json'],
    ['JSON con otra forma', Buffer.from('{"a":1}').toString('base64url')],
    ['inyección en el id', Buffer.from(JSON.stringify([false, '2026-01-01', cursor.createdAt, "x'; drop table invoices;--"])).toString('base64url')],
    ['fecha imposible', Buffer.from(JSON.stringify([false, '2026-13-45', cursor.createdAt, cursor.id])).toString('base64url')],
  ])('rechaza un cursor manipulado (%s) con un error de validación', (_, raw) => {
    try {
      decodeCursor(raw);
      expect.unreachable();
    } catch (error) {
      expect(isDomainError(error) && error.code).toBe('VALIDATION');
    }
  });
});

describe('validación de la consulta', () => {
  it('aplica valores por defecto', () => {
    expect(InvoiceListQuery.parse({})).toEqual({ direction: 'issued', limit: 50 });
  });

  it('convierte el límite de la query string y lo acota', () => {
    expect(InvoiceListQuery.parse({ limit: '20' }).limit).toBe(20);
    expect(InvoiceListQuery.safeParse({ limit: '1000' }).success).toBe(false);
    expect(InvoiceListQuery.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('rechaza estados y terceros desconocidos', () => {
    expect(InvoiceListQuery.safeParse({ status: 'todas' }).success).toBe(false);
    expect(InvoiceListQuery.safeParse({ partyId: '42' }).success).toBe(false);
  });

  it('una búsqueda en blanco es lo mismo que no buscar', () => {
    expect(InvoiceListQuery.parse({ search: '   ' }).search).toBeUndefined();
  });
});
