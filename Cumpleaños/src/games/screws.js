// Screw Out 3D: una casa hecha de piezas sujetas con tornillos.
// Cada tornillo sabe qué piezas lo tapan (blockers): hasta quitarlas no se puede sacar.
export const BOX_SIZE = 3
export const ACTIVE_BOXES = 2
export const BUFFER_SIZE = 6
export const COLORS = ['pink', 'gold', 'paper']

const ROOF_TILT = Math.atan(1.7 / 2.8)
const ROOFS = ['roofFront', 'roofBack']
const WALLS = ['wallFront', 'wallBack', 'wallLeft', 'wallRight']

// Piezas de la casa. Medidas en metros de juguete; y = 0 es el suelo de la mesa.
// face: cara donde va el tornillo ('+y', '+z', '-z', '+x', '-x'); at: coordenadas sobre esa cara.
const HOUSE = [
  {
    id: 'base',
    shape: 'box',
    size: [6.4, 0.4, 6.4],
    pos: [0, 0.2, 0],
    color: 'ink2',
    screws: [
      { face: '+y', at: [-1.8, -1.6] },
      { face: '+y', at: [-0.1, -1.7] },
      { face: '+y', at: [1.8, 0.6] },
      { face: '+y', at: [-0.2, 1.8] },
    ].map((s) => ({ ...s, blockers: [...WALLS, 'table', 'bed', 'gift'] })),
  },
  {
    id: 'wallFront',
    shape: 'box',
    size: [5, 2.6, 0.2],
    pos: [0, 1.7, 2.4],
    color: 'wood',
    screws: [
      { face: '+y', at: [-1.9, 0], blockers: ROOFS },
      { face: '+y', at: [1.9, 0], blockers: ROOFS },
      { face: '+z', at: [-2.05, -0.9], blockers: ['door', 'windowFL', 'windowFR'] },
    ],
  },
  {
    id: 'wallBack',
    shape: 'box',
    size: [5, 2.6, 0.2],
    pos: [0, 1.7, -2.4],
    color: 'wood',
    screws: [
      { face: '+y', at: [-1.9, 0], blockers: ROOFS },
      { face: '+y', at: [1.9, 0], blockers: ROOFS },
      { face: '-z', at: [1.9, -0.9], blockers: ['windowB'] },
    ],
  },
  {
    id: 'wallLeft',
    shape: 'box',
    size: [0.2, 2.6, 4.6],
    pos: [-2.4, 1.7, 0],
    color: 'wood',
    screws: [
      { face: '+y', at: [0, -1.6], blockers: [...ROOFS, 'gableLeft'] },
      { face: '+y', at: [0, 1.6], blockers: [...ROOFS, 'gableLeft'] },
      { face: '-x', at: [1.4, -0.9], blockers: ['windowL'] },
    ],
  },
  {
    id: 'wallRight',
    shape: 'box',
    size: [0.2, 2.6, 4.6],
    pos: [2.4, 1.7, 0],
    color: 'wood',
    screws: [
      { face: '+y', at: [0, -1.6], blockers: [...ROOFS, 'gableRight'] },
      { face: '+y', at: [0, 1.6], blockers: [...ROOFS, 'gableRight'] },
      { face: '+x', at: [-1.4, -0.9], blockers: ['windowR'] },
    ],
  },
  {
    id: 'door',
    shape: 'box',
    size: [0.9, 1.6, 0.08],
    pos: [0, 1.2, 2.54],
    color: 'ink2',
    decor: [{ size: [0.12, 0.12, 0.06], pos: [0.3, 0, 0.06], color: 'gold' }],
    screws: [
      { face: '+z', at: [0, 0.5] },
      { face: '+z', at: [0, -0.45] },
    ],
  },
  ...[
    ['windowFL', [-1.6, 2.1, 2.54], '+z'],
    ['windowFR', [1.6, 2.1, 2.54], '+z'],
    ['windowB', [-1.2, 2.1, -2.54], '-z'],
  ].map(([id, pos, face]) => ({
    id,
    shape: 'box',
    size: [0.9, 0.75, 0.08],
    pos,
    color: 'ink',
    decor: [{ size: [0.66, 0.5, 0.1], pos: [0, 0, 0], color: 'glass' }],
    screws: [
      { face, at: [-0.33, 0] },
      { face, at: [0.33, 0] },
    ],
  })),
  ...[
    ['windowL', [-2.54, 2.1, -0.4], '-x'],
    ['windowR', [2.54, 2.1, 0.4], '+x'],
  ].map(([id, pos, face]) => ({
    id,
    shape: 'box',
    size: [0.08, 0.75, 0.9],
    pos,
    color: 'ink',
    decor: [{ size: [0.1, 0.5, 0.66], pos: [0, 0, 0], color: 'glass' }],
    screws: [
      { face, at: [-0.33, 0] },
      { face, at: [0.33, 0] },
    ],
  })),
  {
    id: 'gableLeft',
    shape: 'gable',
    pos: [-2.4, 3.0, 0],
    rot: [0, -Math.PI / 2, 0],
    color: 'wood',
    screws: [{ face: '+z', at: [0, 0.55] }],
  },
  {
    id: 'gableRight',
    shape: 'gable',
    pos: [2.4, 3.0, 0],
    rot: [0, Math.PI / 2, 0],
    color: 'wood',
    screws: [{ face: '+z', at: [0, 0.55] }],
  },
  {
    id: 'roofFront',
    shape: 'box',
    size: [5.9, 0.18, 3.4],
    pos: [0, 3.82, 1.42],
    rot: [ROOF_TILT, 0, 0],
    color: 'roof',
    screws: [-2, 0, 2].map((x) => ({ face: '+y', at: [x, 0] })),
  },
  {
    id: 'roofBack',
    shape: 'box',
    size: [5.9, 0.18, 3.4],
    pos: [0, 3.82, -1.42],
    rot: [-ROOF_TILT, 0, 0],
    color: 'roof',
    screws: [
      { face: '+y', at: [-2, 0] },
      { face: '+y', at: [0, 0] },
      { face: '+y', at: [1.6, 0.05], blockers: ['chimney'] },
    ],
  },
  {
    id: 'chimney',
    shape: 'box',
    size: [0.6, 1.4, 0.6],
    pos: [1.6, 4.5, -1.25],
    color: 'ink2',
    screws: [
      { face: '+z', at: [0, 0.3] },
      { face: '+x', at: [0, 0.3] },
      { face: '-x', at: [0, 0.3] },
    ],
  },
  {
    id: 'table',
    shape: 'box',
    size: [1.2, 0.6, 0.8],
    pos: [-1.1, 0.7, 0.8],
    color: 'paper',
    screws: [
      { face: '+y', at: [-0.35, 0] },
      { face: '+y', at: [0.35, 0] },
    ],
  },
  {
    id: 'bed',
    shape: 'box',
    size: [1.4, 0.45, 2.0],
    pos: [1.2, 0.62, -1.1],
    color: 'paper',
    decor: [
      { size: [1.42, 0.08, 1.3], pos: [0, 0.24, 0.32], color: 'pink' },
      { size: [0.9, 0.16, 0.4], pos: [0, 0.3, -0.7], color: 'paper' },
    ],
    screws: [
      { face: '+y', at: [-0.4, 0.15] },
      { face: '+y', at: [0.4, 0.15] },
    ],
  },
  {
    id: 'gift',
    shape: 'box',
    size: [0.8, 0.7, 0.8],
    pos: [0.9, 0.75, 1.2],
    color: 'roof',
    decor: [
      { size: [0.82, 0.72, 0.16], pos: [0, 0, 0], color: 'gold' },
      { size: [0.16, 0.72, 0.82], pos: [0, 0, 0], color: 'gold' },
    ],
    screws: [
      { face: '+y', at: [-0.24, -0.24] },
      { face: '+y', at: [0.24, 0.24] },
    ],
  },
]

const INTERIOR = ['table', 'bed', 'gift']
HOUSE.filter((p) => INTERIOR.includes(p.id)).forEach((p) => p.screws.forEach((s) => (s.blockers = ROOFS)))

const rand = (n) => Math.floor(Math.random() * n)
const shuffle = (list) => {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

let uid = 0

// Una casa nueva con los colores de los tornillos repartidos en tríos.
export function buildHouse() {
  const parts = HOUSE.map((p) => ({
    ...p,
    removed: false,
    screws: p.screws.map((s) => ({ ...s, id: ++uid, blockers: s.blockers ?? [], color: null, removed: false })),
  }))
  const screws = parts.flatMap((p) => p.screws)
  const triples = Array.from({ length: screws.length / BOX_SIZE }, (_, i) => COLORS[i % COLORS.length])
  const colors = shuffle(triples.flatMap((c) => Array(BOX_SIZE).fill(c)))
  screws.forEach((s, i) => (s.color = colors[i]))
  const pending = {}
  triples.forEach((c) => (pending[c] = (pending[c] ?? 0) + 1))
  return { parts, pending }
}

export function isBlocked(parts, screw) {
  return screw.blockers.some((id) => !parts.find((p) => p.id === id).removed)
}

function accessibleColors(parts) {
  const counts = {}
  parts.forEach((p) =>
    p.screws.forEach((s) => {
      if (!s.removed && !isBlocked(parts, s)) counts[s.color] = (counts[s.color] ?? 0) + 1
    }),
  )
  return counts
}

// Siguiente caja: un color distinto de las cajas abiertas y que antes se pueda llenar (somos buenos).
export function nextBoxColor(pending, parts, buffer, openColors = []) {
  const reachable = accessibleColors(parts)
  let candidates = Object.keys(pending).filter((c) => pending[c] > 0)
  if (!candidates.length) return null
  const fresh = candidates.filter((c) => !openColors.includes(c))
  if (fresh.length) candidates = fresh
  const score = (c) => buffer.filter((b) => b === c).length * 2 + (reachable[c] ?? 0) + Math.random() * 0.5
  return candidates.sort((a, b) => score(b) - score(a))[0]
}
