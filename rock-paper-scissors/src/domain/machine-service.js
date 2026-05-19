import { MOVES } from './constants.js';

export function getMachineMove(lastMachineMove) {
  const pool = lastMachineMove
    ? MOVES.filter((move) => move !== lastMachineMove)
    : [...MOVES];

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}