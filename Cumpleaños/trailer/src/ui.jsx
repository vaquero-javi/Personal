// Piezas visuales del tráiler, con el mismo lenguaje que la web (DESIGN.md):
// píxel de 4px, profundidad sólida sin desenfoque y movimiento por pasos.
import { AbsoluteFill, Easing, Img, interpolate, random, staticFile, useCurrentFrame } from 'remotion'
import manifest from '../public/cap/manifest.json'
import { FPS } from './timeline.js'

export const C = {
  ink: '#170b14',
  ink2: '#2b1226',
  pink: '#ff3d8b',
  pinkDeep: '#a3104f',
  gold: '#ffc53d',
  goldDeep: '#b9780c',
  paper: '#fff4ea',
  paperDim: '#f0d9e4',
}
export const F = {
  display: "'Jersey 10', 'Pixelify Sans', monospace",
  body: "'Pixelify Sans', monospace",
  label: "'Press Start 2P', monospace",
}

// La única curva suave: cámara y encendido CRT.
export const smooth = Easing.bezier(0.4, 0, 0.2, 1)

// Progreso cuantizado en `steps` pasos, como el `steps()` de la web.
export const stepped = (frame, start, dur, steps = 4) => {
  const p = Math.min(1, Math.max(0, (frame - start) / dur))
  return Math.ceil(p * steps) / steps
}

// Aparición "pop" por pasos: escala y presencia.
export function Pop({ at, children, dur = 6, from = 0.55, style }) {
  const frame = useCurrentFrame()
  const q = stepped(frame, at, dur)
  if (q === 0) return null
  return <div style={{ transform: `scale(${from + (1 - from) * q})`, ...style }}>{children}</div>
}

// Parpadeo por pasos (on/off).
export const blink = (frame, period = 22) => Math.floor(frame / (period / 2)) % 2 === 0

export const extrude = (u = 4, base = 'pink') =>
  base === 'gold'
    ? `0 ${u}px 0 ${C.goldDeep}, 0 ${2 * u}px 0 ${C.pinkDeep}, 0 ${3 * u}px 0 ${C.ink}`
    : `0 ${u}px 0 ${C.pink}, 0 ${2 * u}px 0 ${C.pinkDeep}, 0 ${3 * u}px 0 ${C.ink}`

// Grabación real de la web: elige el fotograma capturado según el tiempo.
export function Footage({ scene, from = 0, speed = 1 }) {
  const frame = useCurrentFrame()
  const { frames } = manifest[scene]
  const t = from + (frame / FPS) * 1000 * speed
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (frames[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  return <Img src={staticFile(`cap/${scene}/${frames[lo].file}`)} style={{ width: 1920, height: 1080, display: 'block' }} />
}

// Movimiento de cámara: de un encuadre a otro (escala + punto enfocado en px del lienzo).
export function Camera({ from, to, dur, delay = 0, children }) {
  const frame = useCurrentFrame()
  const p = interpolate(frame, [delay, delay + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: smooth })
  const s = from.s + (to.s - from.s) * p
  const x = from.x + (to.x - from.x) * p
  const y = from.y + (to.y - from.y) * p
  // Mantiene el punto (x, y) en el centro, sin salirse del borde.
  const tx = Math.min(0, Math.max(1920 - 1920 * s, 960 - x * s))
  const ty = Math.min(0, Math.max(1080 - 1080 * s, 540 - y * s))
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: C.ink }}>
      <div style={{ position: 'absolute', width: 1920, height: 1080, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>
        {children}
      </div>
    </AbsoluteFill>
  )
}

// Capa CRT: líneas finas y viñeta, como en la web.
export function Crt({ strength = 1 }) {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: strength }}>
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(to bottom, rgba(23,11,20,0.28) 0 1px, transparent 1px 3px)' }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent 55%, ${C.ink} 130%)` }} />
    </AbsoluteFill>
  )
}

// Fondo de pantallas sin foto: plum con centro iluminado.
export function Ground() {
  return <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, ${C.ink2} 0%, ${C.ink} 70%)` }} />
}

// Iconos pixel-art copiados de la web (src/components/PixelIcon.jsx).
const INKS = { p: C.pink, w: C.paper, k: C.ink, g: C.goldDeep }
const SHAPES = {
  heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  arrow: ['#...', '##..', '###.', '####', '###.', '##..', '#...'],
  down: ['#####', '.###.', '..#..'],
}
export function PixelIcon({ name, size = 4, color = 'currentColor', style }) {
  const rows = SHAPES[name]
  return (
    <svg viewBox={`0 0 ${rows[0].length} ${rows.length}`} width={rows[0].length * size} height={rows.length * size} shapeRendering="crispEdges" style={style}>
      {rows.flatMap((row, y) =>
        [...row].map((c, x) => (c === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={INKS[c] ?? color} />)),
      )}
    </svg>
  )
}

// Marco de diálogo RPG: borde rosa, hueco tinta, filete paper-dim, esquinas mordidas.
export const notch = (u = 4) =>
  `polygon(${u}px 0, calc(100% - ${u}px) 0, calc(100% - ${u}px) ${u}px, 100% ${u}px, 100% calc(100% - ${u}px), calc(100% - ${u}px) calc(100% - ${u}px), calc(100% - ${u}px) 100%, ${u}px 100%, ${u}px calc(100% - ${u}px), 0 calc(100% - ${u}px), 0 ${u}px, ${u}px ${u}px)`
export const dialogFrame = (u = 4) => ({
  background: C.ink,
  border: `${u}px solid ${C.pink}`,
  boxShadow: `inset 0 0 0 ${u}px ${C.ink}, inset 0 0 0 ${2 * u}px ${C.paperDim}`,
  clipPath: notch(u),
})

// HUD superior de la web.
export function Hud({ level = '00', scale = 1.4 }) {
  const label = { color: C.gold, fontFamily: F.label, fontSize: 12 * scale, textTransform: 'uppercase', textShadow: `0 4px 0 ${C.ink}` }
  const val = { ...label, color: C.paper, marginLeft: 18 * scale }
  return (
    <div style={{ position: 'absolute', top: 56, left: 64, right: 64, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span><span style={label}>Jugadora</span><span style={val}>1</span></span>
      <span><span style={label}>Nivel</span><span style={val}>{level}</span></span>
      <span style={{ display: 'flex', gap: 8, filter: `drop-shadow(0 4px 0 ${C.ink})` }}>
        {[0, 1, 2].map((i) => <PixelIcon key={i} name="heart" size={6} color={C.pink} />)}
      </span>
    </div>
  )
}

// Cortinilla de bloques: tapa en desorden antes del corte y destapa después.
const COLS = 16
const ROWS = 9
export function PixelWipe({ center, half = 7 }) {
  const frame = useCurrentFrame()
  const rel = frame - center
  if (rel < -half || rel >= half) return null
  const cell = 1920 / COLS
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: COLS * ROWS }, (_, i) => {
        const r = random(`wipe-${center}-${i}`)
        const onAt = -half + Math.floor(random(`on-${center}-${i}`) * (half - 2))
        const offAt = Math.floor(random(`off-${center}-${i}`) * (half - 1)) + 1
        if (rel < onAt || rel >= offAt) return null
        const color = r < 0.72 ? C.pink : r < 0.9 ? C.ink : C.gold
        return (
          <div
            key={i}
            style={{ position: 'absolute', left: (i % COLS) * cell, top: Math.floor(i / COLS) * cell, width: cell + 1, height: cell + 1, background: color }}
          />
        )
      })}
    </AbsoluteFill>
  )
}

// Rótulo de nivel: "NIVEL 1" + nombre + mecánica, entra por pasos desde abajo.
export function LevelTag({ number, name, detail, at = 4 }) {
  const frame = useCurrentFrame()
  const q = stepped(frame, at, 8, 4)
  const q2 = stepped(frame, at + 6, 6, 3)
  if (q === 0) return null
  return (
    <div style={{ position: 'absolute', left: 96, bottom: 110, transform: `translateY(${(1 - q) * 48}px)` }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 16, background: C.gold, color: C.ink, padding: '12px 20px 12px 16px', clipPath: notch(4), borderBottom: `8px solid ${C.goldDeep}` }}>
        <PixelIcon name="arrow" size={4} color={C.pinkDeep} />
        <span style={{ fontFamily: F.label, fontSize: 22, textTransform: 'uppercase' }}>Nivel {number}</span>
      </div>
      <div style={{ fontFamily: F.display, fontSize: 168, lineHeight: 0.82, color: C.paper, textTransform: 'uppercase', textShadow: extrude(8), marginTop: 22 }}>
        {name}
      </div>
      {q2 > 0 && (
        <div style={{ ...dialogFrame(4), display: 'inline-block', marginTop: 40, padding: '16px 26px', fontFamily: F.body, fontSize: 34, color: C.paper, opacity: 1, transform: `scaleY(${q2})`, transformOrigin: 'top' }}>
          {detail}
        </div>
      )}
    </div>
  )
}

// Oscurece un lado del encuadre para que el rótulo se lea sobre la grabación.
export function Scrim({ side = 'left', amount = 0.85 }) {
  return (
    <AbsoluteFill
      style={{
        background:
          side === 'left'
            ? `linear-gradient(90deg, rgba(23,11,20,${amount}) 0%, rgba(23,11,20,${amount}) 30%, transparent 37%)`
            : `linear-gradient(0deg, rgba(23,11,20,${amount}) 0%, transparent 50%)`,
      }}
    />
  )
}
