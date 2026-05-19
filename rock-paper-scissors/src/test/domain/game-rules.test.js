import { describe, it, expect } from 'vitest';
import { getRoundResult } from '../../domain/game-rules.js';

describe('getRoundResult', () => {
  it('piedra gana a tijera', () => {
    expect(getRoundResult('rock', 'scissors')).toBe('win');
  });

  it('tijera gana a papel', () => {
    expect(getRoundResult('scissors', 'paper')).toBe('win');
  });

  it('papel gana a piedra', () => {
    expect(getRoundResult('paper', 'rock')).toBe('win');
  });

  it('detecta derrota', () => {
    expect(getRoundResult('rock', 'paper')).toBe('lose');
  });

  it('detecta empate', () => {
    expect(getRoundResult('paper', 'paper')).toBe('draw');
  });
});