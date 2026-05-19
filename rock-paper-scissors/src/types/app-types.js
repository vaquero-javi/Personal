/**
 * @typedef {'rock' | 'paper' | 'scissors'} Move
 */

/**
 * @typedef {'win' | 'lose' | 'draw' | null} RoundResult
 */

/**
 * @typedef Player
 * @property {string} id
 * @property {string} name
 * @property {string} normalizedName
 * @property {number} score
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef RoundState
 * @property {Move | null} playerMove
 * @property {Move | null} machineMove
 * @property {RoundResult} result
 * @property {boolean} isResolving
 * @property {Move | null} lastMachineMove
 * @property {number | null} startedAt
 */

/**
 * @typedef SessionState
 * @property {'/' | '/game'} currentRoute
 * @property {string | null} activePlayerId
 * @property {RoundState} currentRound
 * @property {string} transientError
 */

/**
 * @typedef AppState
 * @property {number} version
 * @property {Player[]} players
 * @property {SessionState} session
 */