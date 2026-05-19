export function createInitialState() {
  return {
    version: 1,
    players: [],
    session: {
      currentRoute: '/',
      activePlayerId: null,
      currentRound: {
        playerMove: null,
        machineMove: null,
        result: null,
        isResolving: false,
        lastMachineMove: null,
        startedAt: null
      },
      transientError: ''
    }
  };
}