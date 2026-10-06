// Escritura a mano para la demo: convierte texto en trazos de lápiz con una fuente de trazo único
// (Hershey/EMS, sin contornos), con un poco de temblor y presión variable para que parezca humana.
// Los trazos salen en unidades de página de la app (ancho 820), listos para `drawing.strokes`.
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const FONT_FILE = require.resolve('hersheytext/svg_fonts/EMSFelix.svg')

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

const GLYPHS = {}
for (const [, attrs] of fs.readFileSync(FONT_FILE, 'utf8').matchAll(/<glyph([^>]*)\/?>/g)) {
  const uni = attrs.match(/unicode="([^"]*)"/)
  if (!uni) continue
  const adv = Number(attrs.match(/horiz-adv-x="([^"]*)"/)?.[1] ?? 378)
  const d = attrs.match(/ d="([^"]*)"/)?.[1] ?? ''
  const lines = d
    .split('M')
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => {
      const nums = seg.replace(/L/g, ' ').trim().split(/\s+/).map(Number)
      const pts = []
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]])
      return pts
    })
  GLYPHS[decode(uni[1])] = { adv, lines }
}

// Aleatorio con semilla, para que cada grabación salga igual.
let seed = 11
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

/** Rellena un polígono con puntos cada `step` unidades, para que el trazo sea suave al dibujarlo. */
function densify(pts, step) {
  const out = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step))
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n])
  }
  return out
}

/**
 * Escribe `text` con la línea base en (x, y). `size` = alto de la mayúscula en px de página.
 * Devuelve los trazos en orden de escritura.
 */
export function write(text, { x, y, size = 22, color = '#1c1b18', width = 3.5, slant = 0.12, jitter = 0.6 }) {
  const k = size / 500 // cap-height de la fuente = 500
  const strokes = []
  let cx = x
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS['?']
    const wobble = (rnd() - 0.5) * size * 0.06
    for (const line of g.lines) {
      if (line.length < 2) continue
      const pts = densify(
        line.map(([gx, gy]) => [cx + gx * k + gy * k * slant, y - gy * k + wobble]),
        2.2,
      ).map(([px, py], i, all) => {
        const t = i / Math.max(1, all.length - 1)
        // La presión sube al apoyar y baja al levantar el lápiz.
        const p = 0.35 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + (rnd() - 0.5) * 0.08
        return [+(px + (rnd() - 0.5) * jitter).toFixed(1), +(py + (rnd() - 0.5) * jitter).toFixed(1), +Math.max(0.2, Math.min(1, p)).toFixed(2)]
      })
      strokes.push({ tool: 'pen', color, size: width, points: pts })
    }
    cx += g.adv * k * 1.08
  }
  return { strokes, end: cx }
}

/** Trazo de rotulador: una línea algo ondulada de `x0` a `x1`. */
export function highlight(x0, x1, y, { color = '#f2d661', size = 22 } = {}) {
  const pts = []
  for (let px = x0; px <= x1; px += 6) pts.push([px, +(y + Math.sin(px / 40) * 1.5).toFixed(1), 0.5])
  return { tool: 'highlighter', color, size, points: pts }
}

/** Óvalo a mano alrededor de una caja, sin cerrar del todo, como cuando se rodea algo. */
export function circle(cx, cy, rx, ry, { color = '#d45f32', width = 3 } = {}) {
  const pts = []
  for (let a = -0.4; a <= Math.PI * 2 + 0.25; a += 0.05) {
    const r = 1 + Math.sin(a * 3) * 0.015
    pts.push([+(cx + Math.cos(a) * rx * r).toFixed(1), +(cy + Math.sin(a) * ry * r - a * 1.2).toFixed(1), 0.6])
  }
  return { tool: 'pen', color, size: width, points: pts }
}

/** Flecha a mano de (x0,y0) a (x1,y1). */
export function arrow(x0, y0, x1, y1, { color = '#1c1b18', width = 3 } = {}) {
  const ang = Math.atan2(y1 - y0, x1 - x0)
  const head = 12
  const body = densify([[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2 - 3], [x1, y1]], 3).map(([a, b]) => [a, b, 0.6])
  const tip = (d) => [x1 - head * Math.cos(ang + d), y1 - head * Math.sin(ang + d)]
  return [
    { tool: 'pen', color, size: width, points: body },
    { tool: 'pen', color, size: width, points: densify([tip(0.5), [x1, y1], tip(-0.5)], 3).map(([a, b]) => [a, b, 0.6]) },
  ]
}

// ——— La página de apuntes del vídeo ———
// Papel rayado: un renglón cada 34 px, margen a 56 px.
const ROW = 34
const L = 80
const base = (row) => row * ROW - 7

export function fotosintesisPage() {
  const blocks = []
  const add = (name, strokes) => blocks.push({ name, strokes: [].concat(strokes) })

  const title = write('La fotosíntesis', { x: L, y: base(3), size: 40, width: 4.2 })
  add('title', title.strokes)
  add('title-hl', highlight(L - 6, title.end + 4, base(3) - 12, { size: 26 }))

  add('l1', write('1. Fase luminosa', { x: L, y: base(5), size: 24, color: '#d45f32' }).strokes)
  const l2 = write('tilacoides', { x: L + 28, y: base(6), size: 20 })
  add('l2', [...l2.strokes, ...arrow(l2.end + 12, base(6) - 7, l2.end + 58, base(6) - 7)])
  add('l2b', write('ATP + NADPH + O2', { x: l2.end + 72, y: base(6), size: 20 }).strokes)

  add('l3', write('2. Ciclo de Calvin', { x: L, y: base(8), size: 24, color: '#d45f32' }).strokes)
  const l4 = write('estroma', { x: L + 28, y: base(9), size: 20 })
  add('l4', [...l4.strokes, ...arrow(l4.end + 12, base(9) - 7, l4.end + 58, base(9) - 7)])
  add('l4b', write('fija el CO2 y forma glucosa', { x: l4.end + 72, y: base(9), size: 20 }).strokes)

  const eq = write('6CO2 + 6H2O = C6H12O6 + 6O2', { x: L + 24, y: base(12), size: 21, color: '#3b6ea8', width: 3.6 })
  add('eq', eq.strokes)
  add('eq-circle', circle((L + 24 + eq.end) / 2, base(12) - 9, (eq.end - L - 24) / 2 + 22, 28))
  return blocks
}

// Vista previa: node handwriting.mjs > preview.svg
if (process.argv[1]?.endsWith('handwriting.mjs')) {
  const blocks = fotosintesisPage()
  const paths = blocks
    .flatMap((b) => b.strokes)
    .map(
      (s) =>
        `<polyline fill="none" stroke="${s.color}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round" ${s.tool === 'highlighter' ? 'opacity="0.45"' : ''} points="${s.points.map((p) => p.slice(0, 2).join(',')).join(' ')}"/>`,
    )
  const lines = Array.from({ length: 16 }, (_, i) => `<line x1="0" x2="820" y1="${(i + 1) * ROW}" y2="${(i + 1) * ROW}" stroke="#0001"/>`)
  console.log(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 520" width="1640" height="1040"><rect width="820" height="520" fill="#fdfcfa"/><line x1="56" x2="56" y1="0" y2="520" stroke="#d45f3247"/>${lines.join('')}${paths.join('')}</svg>`)
}
