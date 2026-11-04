import { describe, expect, it } from 'vitest';
import { isDomainError } from '@omnia/core';
import { appleQrMessage, newCardSecret, parseQr, totp, totpStep, verifyCode } from './credential';

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('TOTP (RFC 6238, apéndice B, SHA-1, 8 cifras)', () => {
  const seed = Buffer.from('12345678901234567890');
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('t=%i → %s', (seconds, expected) => {
    expect(totp(seed, totpStep(new Date(seconds * 1000)))).toBe(expected);
  });
});

describe('verificación del código', () => {
  it('Google: acepta el código actual y ±30 s, y devuelve el paso', () => {
    const seed = newCardSecret('google');
    const now = new Date('2026-11-04T12:00:10Z');
    const step = totpStep(now);
    expect(verifyCode('google', seed, totp(seed, step), now)).toEqual({ ok: true, step });
    expect(verifyCode('google', seed, totp(seed, step - 1), now)).toEqual({ ok: true, step: step - 1 });
    expect(verifyCode('google', seed, totp(seed, step + 1), now)).toEqual({ ok: true, step: step + 1 });
  });

  it('Google: rechaza una captura de hace más de un minuto', () => {
    const seed = newCardSecret('google');
    const now = new Date('2026-11-04T12:00:10Z');
    expect(verifyCode('google', seed, totp(seed, totpStep(now) - 3), now)).toEqual({ ok: false });
  });

  it('Apple: compara el secreto estático', () => {
    const secret = newCardSecret('apple');
    const { code } = parseQr(appleQrMessage(ID, secret));
    expect(verifyCode('apple', secret, code)).toEqual({ ok: true, step: null });
    expect(verifyCode('apple', newCardSecret('apple'), code)).toEqual({ ok: false });
  });

  it('un código de un tipo no vale para el otro', () => {
    expect(verifyCode('apple', newCardSecret('apple'), '12345678')).toEqual({ ok: false });
    expect(verifyCode('google', newCardSecret('google'), 'x'.repeat(43))).toEqual({ ok: false });
  });
});

describe('lectura del QR', () => {
  it('extrae tarjeta y código', () => {
    expect(parseQr(`OMN1:${ID.toUpperCase()}:12345678`)).toEqual({ cardId: ID, code: '12345678' });
  });

  it.each(['https://evil.example', `OMN1:${ID}`, `OMN2:${ID}:12345678`, `OMN1:not-a-uuid:12345678`, `OMN1:${ID}:123`, `OMN1:${ID}:12345678:extra`])(
    'rechaza %s sin tocar la base',
    (raw) => {
      try {
        parseQr(raw);
        expect.unreachable();
      } catch (error) {
        expect(isDomainError(error) && error.details?.reason).toBe('QR_FORMAT');
      }
    },
  );
});
