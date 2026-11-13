import { beforeAll, describe, expect, it } from 'vitest';
import { decodeSession, encodeSession, hashPassword, passwordProblem, verifyPassword, SESSION_TTL_SECONDS } from './credentials';

beforeAll(() => {
  process.env.ADMIN_SESSION_SECRET = 'x'.repeat(40);
});

describe('contraseñas', () => {
  it('scrypt con sal: la misma contraseña da hashes distintos y ambos verifican', async () => {
    const a = await hashPassword('una-clave-larga');
    const b = await hashPassword('una-clave-larga');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword('una-clave-larga', a)).toBe(true);
    expect(await verifyPassword('otra-clave-larga', a)).toBe(false);
  });

  it('sin hash (email inexistente o sin contraseña) nunca entra', async () => {
    expect(await verifyPassword('', null)).toBe(false);
    expect(await verifyPassword('cualquiera', undefined)).toBe(false);
    expect(await verifyPassword('x', 'md5$abc$def')).toBe(false);
  });

  it('exige 12 caracteres', () => {
    expect(passwordProblem('corta')).not.toBeNull();
    expect(passwordProblem('suficientemente-larga')).toBeNull();
  });
});

describe('sesión firmada', () => {
  const now = Date.UTC(2026, 10, 13, 10);

  it('ida y vuelta', () => {
    const token = encodeSession({ uid: 'u1', ver: 3 }, now);
    expect(decodeSession(token, now)).toEqual({ uid: 'u1', ver: 3, exp: now / 1000 + SESSION_TTL_SECONDS });
  });

  it('caduca a las 12 horas', () => {
    const token = encodeSession({ uid: 'u1', ver: 1 }, now);
    expect(decodeSession(token, now + SESSION_TTL_SECONDS * 1000 - 1)).not.toBeNull();
    expect(decodeSession(token, now + SESSION_TTL_SECONDS * 1000)).toBeNull();
  });

  it('una cookie manipulada no vale', () => {
    const token = encodeSession({ uid: 'u1', ver: 1 }, now);
    const [, sig] = token.split('.');
    const forged = `${Buffer.from(JSON.stringify({ uid: 'otro', ver: 1, exp: now / 1000 + 999 })).toString('base64url')}.${sig}`;
    expect(decodeSession(forged, now)).toBeNull();
    expect(decodeSession(`${token}x`, now)).toBeNull();
    expect(decodeSession('basura', now)).toBeNull();
    expect(decodeSession(undefined, now)).toBeNull();
  });

  it('con otro secreto no vale', () => {
    const token = encodeSession({ uid: 'u1', ver: 1 }, now);
    process.env.ADMIN_SESSION_SECRET = 'y'.repeat(40);
    expect(decodeSession(token, now)).toBeNull();
    process.env.ADMIN_SESSION_SECRET = 'x'.repeat(40);
  });

  it('sin secreto (o corto) no arranca', () => {
    process.env.ADMIN_SESSION_SECRET = 'corto';
    expect(() => encodeSession({ uid: 'u1', ver: 1 }, now)).toThrow(/ADMIN_SESSION_SECRET/);
    process.env.ADMIN_SESSION_SECRET = 'x'.repeat(40);
  });
});
