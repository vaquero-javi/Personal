const WIN_MAP = {
  rock: 'scissors',
  scissors: 'paper',
  paper: 'rock'
};

export function getRoundResult(playerMove, machineMove) {
  if (playerMove === machineMove) {
    return 'draw';
  }

  return WIN_MAP[playerMove] === machineMove ? 'win' : 'lose';
}