// Generador de sopa de letras: coloca las palabras en línea recta y rellena el resto.
const DIRECTIONS = [
  [0, 1], // →
  [1, 0], // ↓
  [1, 1], // ↘
  [-1, 1], // ↗
  [0, -1], // ← (al revés, para que cueste un poco)
]

const ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'
const rand = (n) => Math.floor(Math.random() * n)

function tryBuild(words, size) {
  const grid = Array.from({ length: size }, () => Array(size).fill(null))
  const placed = []
  const sorted = [...words].sort((a, b) => b.length - a.length)

  for (const word of sorted) {
    let ok = false
    for (let attempt = 0; attempt < 300 && !ok; attempt++) {
      const [dr, dc] = DIRECTIONS[rand(DIRECTIONS.length)]
      const r0 = rand(size)
      const c0 = rand(size)
      const rEnd = r0 + dr * (word.length - 1)
      const cEnd = c0 + dc * (word.length - 1)
      if (rEnd < 0 || rEnd >= size || cEnd < 0 || cEnd >= size) continue
      const cells = [...word].map((_, i) => [r0 + dr * i, c0 + dc * i])
      if (cells.some(([r, c], i) => grid[r][c] && grid[r][c] !== word[i])) continue
      cells.forEach(([r, c], i) => (grid[r][c] = word[i]))
      placed.push({ word, cells })
      ok = true
    }
    if (!ok) return null
  }

  for (const row of grid) {
    for (let c = 0; c < size; c++) row[c] ??= ALPHABET[rand(ALPHABET.length)]
  }
  return { grid, placed }
}

export function buildWordSearch(words, size) {
  for (let i = 0; i < 50; i++) {
    const result = tryBuild(words, size)
    if (result) return result
  }
  throw new Error('No caben las palabras en la sopa de letras')
}

// Celdas en línea recta entre dos puntos (horizontal, vertical o diagonal), o null.
export function lineBetween([r0, c0], [r1, c1]) {
  const dr = Math.sign(r1 - r0)
  const dc = Math.sign(c1 - c0)
  const len = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0))
  if (r0 !== r1 && c0 !== c1 && Math.abs(r1 - r0) !== Math.abs(c1 - c0)) return null
  return Array.from({ length: len + 1 }, (_, i) => [r0 + dr * i, c0 + dc * i])
}

export const key = ([r, c]) => `${r}-${c}`
