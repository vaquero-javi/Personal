import { describe, it, expect } from 'vitest';
import { normalizePlayerName, validatePlayerName } from '../../domain/validators.js';

describe('validators', () => {
  it('valida nombre correcto', () => {
    const result = validatePlayerName('Carlos');
    expect(result.ok).toBe(true);
    expect(result.value).toBe('Carlos');
  });

  it('rechaza nombre vacío', () => {
    const result = validatePlayerName('   ');
    expect(result.ok).toBe(false);
  });

  it('normaliza espacios y mayúsculas', () => {
    expect(normalizePlayerName('  CaRLos   Ruiz  ')).toBe('carlos ruiz');
  });

  it('rechaza caracteres inválidos', () => {
    const result = validatePlayerName('@@@');
    expect(result.ok).toBe(false);
  });
});