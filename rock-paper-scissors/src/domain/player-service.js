import { normalizePlayerName, sanitizePlayerName } from './validators.js';

export function createPlayer(name) {
  const now = Date.now();
  const safeName = sanitizePlayerName(name);

  return {
    id: crypto.randomUUID(),
    name: safeName,
    normalizedName: normalizePlayerName(safeName),
    score: 0,
    createdAt: now,
    updatedAt: now
  };
}

export function findPlayerByName(players, name) {
  const normalized = normalizePlayerName(name);
  return players.find((player) => player.normalizedName === normalized) ?? null;
}

export function updatePlayer(players, updatedPlayer) {
  return players.map((player) =>
    player.id === updatedPlayer.id ? updatedPlayer : player
  );
}