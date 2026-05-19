import { createInitialState } from './initial-state.js';
import { loadState, saveState } from '../services/storage-service.js';
import {
  createPlayer,
  findPlayerByName,
  updatePlayer
} from '../domain/player-service.js';
import { validatePlayerName } from '../domain/validators.js';
import { getMachineMove } from '../domain/machine-service.js';
import { getRoundResult } from '../domain/game-rules.js';

class AppStore {
  _state = createInitialState();
  _listeners = new Set();

  getState() {
    return structuredClone(this._state);
  }

  subscribe(listener) {
    this._listeners.add(listener);
    listener(this.getState());

    return () => {
      this._listeners.delete(listener);
    };
  }

  _emit() {
    const snapshot = this.getState();

    for (const listener of this._listeners) {
      listener(snapshot);
    }
  }

  _persist() {
    const result = saveState(this._state);

    if (!result.ok) {
      this._state.session.transientError = result.error;
    }
  }

  _commit() {
    this._persist();
    this._emit();
  }

  hydrate() {
    const nextState = loadState();

    if (nextState?.session?.currentRound?.isResolving) {
      nextState.session.currentRound = {
        ...nextState.session.currentRound,
        playerMove: null,
        machineMove: null,
        result: null,
        isResolving: false,
        startedAt: null
      };
    }

    this._state = nextState;
    this._commit();
  }

  setRoute(path) {
    this._state.session.currentRoute = path === '/game' ? '/game' : '/';
    this._commit();
  }

  setTransientError(message) {
    this._state.session.transientError = String(message ?? '');
    this._commit();
  }

  clearTransientError() {
    if (!this._state.session.transientError) {
      return;
    }

    this._state.session.transientError = '';
    this._commit();
  }

  getActivePlayer() {
    const { activePlayerId } = this._state.session;

    if (!activePlayerId) {
      return null;
    }

    return (
      this._state.players.find((player) => player.id === activePlayerId) ?? null
    );
  }

  startGame(name) {
    const validation = validatePlayerName(name);

    if (!validation.ok) {
      this._state.session.transientError = validation.error;
      this._emit();
      return { ok: false, error: validation.error };
    }

    let player = findPlayerByName(this._state.players, validation.value);

    if (!player) {
      player = createPlayer(validation.value);
      this._state.players = [...this._state.players, player];
    }

    this._state.session.activePlayerId = player.id;
    this._state.session.currentRoute = '/game';
    this._state.session.currentRound = {
      playerMove: null,
      machineMove: null,
      result: null,
      isResolving: false,
      lastMachineMove: this._state.session.currentRound.lastMachineMove,
      startedAt: null
    };
    this._state.session.transientError = '';

    this._commit();

    return { ok: true, player };
  }

  async playRound(move) {
    const activePlayer = this.getActivePlayer();

    if (!activePlayer) {
      throw new Error('No hay una sesión de jugador activa.');
    }

    if (this._state.session.currentRound.isResolving) {
      throw new Error('Ya hay una jugada en curso.');
    }

    this._state.session.transientError = '';
    this._state.session.currentRound = {
      ...this._state.session.currentRound,
      playerMove: move,
      machineMove: null,
      result: null,
      isResolving: true,
      startedAt: Date.now()
    };
    this._commit();

    await new Promise((resolve) => window.setTimeout(resolve, 1000));

    const machineMove = getMachineMove(
      this._state.session.currentRound.lastMachineMove
    );
    const result = getRoundResult(move, machineMove);

    this._state.session.currentRound = {
      playerMove: move,
      machineMove,
      result,
      isResolving: false,
      lastMachineMove: machineMove,
      startedAt: this._state.session.currentRound.startedAt
    };

    if (result === 'win') {
      const updatedPlayer = {
        ...activePlayer,
        score: activePlayer.score + 1,
        updatedAt: Date.now()
      };

      this._state.players = updatePlayer(this._state.players, updatedPlayer);
    }

    this._commit();
  }

  exitGame() {
    this._state.session.currentRoute = '/';
    this._state.session.activePlayerId = null;
    this._state.session.currentRound = {
      ...this._state.session.currentRound,
      playerMove: null,
      machineMove: null,
      result: null,
      isResolving: false,
      startedAt: null
    };
    this._state.session.transientError = '';
    this._commit();
  }
}

export const appStore = new AppStore();