// Lógica del Block Blast: tablero 8x8, tandas de 3 piezas, filas y columnas llenas se borran.
export const SIZE = 8

const SHAPES = [
  ['#'],
  ['##'],
  ['#', '#'],
  ['###'],
  ['#', '#', '#'],
  ['####'],
  ['#', '#', '#', '#'],
  ['#####'],
  ['#', '#', '#', '#', '#'],
  ['##', '##'],
  ['###', '###', '###'],
  ['###', '###'],
  ['##', '##', '##'],
  ['#.', '##'],
  ['.#', '##'],
  ['##', '#.'],
  ['##', '.#'],
  ['#..', '#..', '###'],
  ['..#', '..#', '###'],
  ['###', '#..', '#..'],
  ['###', '..#', '..#'],
  ['###', '.#.'],
  ['.#.', '###'],
  ['#.', '##', '#.'],
  ['.#', '##', '.#'],
  ['##.', '.##'],
  ['.##', '##.'],
  ['#.', '##', '.#'],
  ['.#', '##', '#.'],
  ['#..', '###'],
  ['###', '..#'],
]

export const COLORS = ['pink', 'gold', 'paper', 'plum']

const rand = (n) => Math.floor(Math.random() * n)
let uid = 0

export function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null))
}

export function randomPiece() {
  const rows = SHAPES[rand(SHAPES.length)]
  const cells = rows.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === '#' ? [[r, c]] : [])))
  return {
    id: ++uid,
    cells,
    rows: rows.length,
    cols: rows[0].length,
    color: COLORS[rand(COLORS.length)],
  }
}

export function canPlace(board, piece, r0, c0) {
  return piece.cells.every(([r, c]) => {
    const rr = r0 + r
    const cc = c0 + c
    return rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && !board[rr][cc]
  })
}

export function fitsAnywhere(board, piece) {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (canPlace(board, piece, r, c)) return true
  return false
}

// Una tanda nueva; se intenta que al menos una pieza quepa (somos buenos).
export function newTray(board) {
  let tray = []
  for (let i = 0; i < 30; i++) {
    tray = [randomPiece(), randomPiece(), randomPiece()]
    if (tray.some((p) => fitsAnywhere(board, p))) break
  }
  return tray
}

export function place(board, piece, r0, c0) {
  const next = board.map((row) => [...row])
  piece.cells.forEach(([r, c]) => (next[r0 + r][c0 + c] = piece.color))
  return next
}

// Filas y columnas completas tras colocar.
export function fullLines(board) {
  const rows = []
  const cols = []
  for (let i = 0; i < SIZE; i++) {
    if (board[i].every(Boolean)) rows.push(i)
    if (board.every((row) => row[i])) cols.push(i)
  }
  const cells = new Set()
  rows.forEach((r) => board[r].forEach((_, c) => cells.add(`${r}-${c}`)))
  cols.forEach((c) => board.forEach((_, r) => cells.add(`${r}-${c}`)))
  return { count: rows.length + cols.length, cells }
}

export function clearCells(board, cells) {
  return board.map((row, r) => row.map((v, c) => (cells.has(`${r}-${c}`) ? null : v)))
}

// Puntos: 1 por cuadradito colocado + 10 por línea, multiplicado si borras varias a la vez o seguidas.
export function scoreFor(pieceCells, lines, streak) {
  if (!lines) return pieceCells
  return pieceCells + lines * 10 * lines + (streak > 1 ? 10 * (streak - 1) : 0)
}
