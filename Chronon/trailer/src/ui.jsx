// Piezas del vídeo, con el lenguaje de la app: papel cálido, tinta, un único acento "ember"
// y la serif Instrument para el énfasis. Movimiento "premium": curvas largas, sin rebote.
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import manifest from '../public/cap/manifest.json'
import { FPS } from './timeline.js'

export const C = {
  night: '#0b0a09',
  night2: '#1a1816',
  paper: '#f6f5f1',
  paper2: '#ebe8e1',
  surface: '#fdfcfa',
  ink: '#1c1b18',
  ink5: '#7b766c',
  ink4: '#a29d92',
  ember: '#d45f32',
  ember3: '#ea9b77',
}
export const F = {
  sans: "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
  mono: "'Geist Mono Variable', ui-monospace, monospace",
  serif: "'Instrument Serif', Georgia, serif",
}

// Curva de la casa: entrada larga que frena con suavidad (la de `animate-rise` de la app).
export const out = Easing.bezier(0.22, 1, 0.36, 1)
export const inOut = Easing.bezier(0.65, 0, 0.35, 1)
export const accel = Easing.bezier(0.55, 0, 1, 0.45)

/** Progreso 0→1 entre dos fotogramas, con curva. */
export const prog = (frame, from, dur, ease = out) =>
  interpolate(frame, [from, from + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })
export const mix = (a, z, p) => a + (z - a) * p

/** Interpolación por tramos con curva en cada tramo. */
export function keys(frame, frames, values, ease = inOut) {
  return interpolate(frame, frames, values, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })
}

// ——— Texto: cada palabra sube desde el desenfoque, como en las keynotes ———
export function Words({ text, at, stagger = 5, dur = 34, exitAt, exitDur = 22, style, wordStyle }) {
  const frame = useCurrentFrame()
  const words = text.split(' ')
  const gone = exitAt === undefined ? 0 : prog(frame, exitAt, exitDur, accel)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '0.24em', ...style }}>
      {words.map((w, i) => {
        const p = prog(frame, at + i * stagger, dur)
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: p * (1 - gone),
              transform: `translateY(${(1 - p) * 0.45 + gone * -0.25}em)`,
              filter: `blur(${(1 - p) * 14 + gone * 10}px)`,
              ...(typeof wordStyle === 'function' ? wordStyle(w, i) : wordStyle),
            }}
          >
            {w}
          </span>
        )
      })}
    </div>
  )
}

/** Titular de dos líneas: sans firme + serif cursiva en el acento. */
export function Headline({ a, b, at, gap = 14, exitAt, color = C.ink, accent = C.ember, size = 96, style }) {
  return (
    <div style={{ textAlign: 'center', lineHeight: 1.02, ...style }}>
      <Words
        text={a}
        at={at}
        exitAt={exitAt}
        style={{ fontFamily: F.sans, fontWeight: 600, fontSize: size, letterSpacing: '-0.035em', color }}
      />
      {b && (
        <Words
          text={b}
          at={at + gap}
          exitAt={exitAt}
          style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: size * 1.08, letterSpacing: '-0.01em', color: accent, marginTop: 4 }}
        />
      )}
    </div>
  )
}

// ——— Grabaciones de la app ———
/**
 * Fotograma grabado según un mapa tiempo de vídeo → tiempo real de grabación:
 * `map` = [[fotogramaLocal, msReales], …]. Entre puntos va lineal (es el reloj de la grabación).
 */
export function Footage({ scene, map }) {
  const frame = useCurrentFrame()
  const { frames, width, height } = manifest[scene]
  const t = interpolate(frame, map.map((m) => m[0]), map.map((m) => m[1]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (frames[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  return (
    <>
      <Img src={staticFile(`cap/${scene}/${frames[lo].file}`)} style={{ position: 'absolute', inset: 0, width, height, display: 'block' }} />
      <Cursor scene={scene} t={t} />
    </>
  )
}
export const msAt = (frame, map) =>
  interpolate(frame, map.map((m) => m[0]), map.map((m) => m[1]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

export function Still({ name, width, height }) {
  return <Img src={staticFile(`cap/${name}.png`)} style={{ position: 'absolute', inset: 0, width, height, display: 'block' }} />
}

/** Cursor de macOS (o lápiz en el iPad) en la posición grabada. */
function Cursor({ scene, t }) {
  const { cursor, device } = manifest[scene]
  if (!cursor?.length || t < cursor[0].t) return null
  let i = 0
  while (i + 1 < cursor.length && cursor[i + 1].t <= t) i++
  const c = cursor[i]
  // Desvanece el cursor si lleva rato quieto al final.
  const idle = t - cursor[cursor.length - 1].t
  const fade = idle > 1500 ? Math.max(0, 1 - (idle - 1500) / 800) : 1
  if (device === 'ipad') return <Pencil x={c.x} y={c.y} down={c.down} />
  return (
    <svg
      width="26"
      height="38"
      viewBox="0 0 13 19"
      style={{ position: 'absolute', left: c.x - 2, top: c.y - 1, opacity: fade, transform: `scale(${c.down ? 0.86 : 1})`, transformOrigin: '2px 1px', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.3))' }}
    >
      <path d="M1 1 L1 15.5 L4.6 12.3 L7 18 L9.4 17 L7.1 11.4 L11.8 11.4 Z" fill="#000" stroke="#fff" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  )
}

/** Apple Pencil estilizado con la punta en (x, y). */
function Pencil({ x, y, down }) {
  const lift = down ? 0 : 10
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 34,
          height: 560,
          transformOrigin: '17px 0',
          transform: `translate(-17px, ${-lift}px) rotate(-148deg)`,
          filter: 'drop-shadow(-18px 26px 18px rgba(0,0,0,.18))',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 11, width: 12, height: 36, background: 'linear-gradient(90deg,#d9d6cf,#fff 45%,#cfccc4)', clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }} />
        <div style={{ position: 'absolute', top: 34, left: 0, width: 34, height: 526, borderRadius: '6px 6px 17px 17px', background: 'linear-gradient(90deg,#e4e1da 0%,#ffffff 38%,#f4f2ee 62%,#d6d3cc 100%)' }} />
      </div>
    </div>
  )
}

// ——— Dispositivos, dibujados en CSS ———
/** MacBook: pantalla de 1440×900 escalada a `width`. */
export function Mac({ width = 1500, children, style }) {
  const s = width / 1440
  const bezel = 22 * s
  return (
    <div style={{ position: 'relative', width: width + bezel * 2, ...style }}>
      <div
        style={{
          position: 'relative',
          padding: bezel,
          paddingTop: bezel * 1.25,
          background: '#0e0e0f',
          borderRadius: `${30 * s}px ${30 * s}px ${8 * s}px ${8 * s}px`,
          boxShadow: `0 0 0 ${2.5 * s}px #2b2b2e, 0 ${60 * s}px ${120 * s}px -${30 * s}px rgba(30,20,10,.45)`,
        }}
      >
        <div style={{ position: 'absolute', top: bezel * 0.45, left: '50%', width: 9 * s, height: 9 * s, marginLeft: -4.5 * s, borderRadius: 99, background: '#1d2a33' }} />
        <div style={{ position: 'relative', width, height: 900 * s, overflow: 'hidden', borderRadius: 6 * s, background: C.paper }}>
          <div style={{ position: 'absolute', width: 1440, height: 900, transform: `scale(${s})`, transformOrigin: '0 0' }}>{children}</div>
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          left: -width * 0.06,
          width: (width + bezel * 2) * 1.12,
          height: 26 * s,
          borderRadius: `0 0 ${40 * s}px ${40 * s}px`,
          background: 'linear-gradient(180deg,#d7d8db 0%,#bfc0c4 45%,#8e8f93 100%)',
        }}
      >
        <div style={{ position: 'absolute', left: '50%', top: 0, width: 220 * s, height: 10 * s, marginLeft: -110 * s, borderRadius: `0 0 ${12 * s}px ${12 * s}px`, background: '#a9aaae' }} />
      </div>
    </div>
  )
}

/** iPad en horizontal: pantalla de 1180×820. */
export function IPad({ width = 1300, children, style }) {
  const s = width / 1180
  const bezel = 26 * s
  return (
    <div
      style={{
        position: 'relative',
        padding: bezel,
        background: '#0f0f10',
        borderRadius: 54 * s,
        boxShadow: `0 0 0 ${5 * s}px #c9c9cc, 0 0 0 ${6 * s}px #9d9da1, 0 ${60 * s}px ${120 * s}px -${30 * s}px rgba(30,20,10,.4)`,
        ...style,
      }}
    >
      <div style={{ position: 'relative', width, height: 820 * s, overflow: 'hidden', borderRadius: 30 * s, background: C.paper }}>
        <div style={{ position: 'absolute', width: 1180, height: 820, transform: `scale(${s})`, transformOrigin: '0 0' }}>{children}</div>
      </div>
    </div>
  )
}

/** iPhone: pantalla de 390×844. */
export function IPhone({ width = 390, children, style, dark = true }) {
  const s = width / 390
  const bezel = 13 * s
  return (
    <div
      style={{
        position: 'relative',
        padding: bezel,
        background: '#0b0b0c',
        borderRadius: 66 * s,
        boxShadow: `0 0 0 ${3.5 * s}px ${dark ? '#3a3a3d' : '#d2d2d5'}, 0 ${50 * s}px ${100 * s}px -${20 * s}px rgba(0,0,0,.5)`,
        ...style,
      }}
    >
      <div style={{ position: 'relative', width, height: 844 * s, overflow: 'hidden', borderRadius: 54 * s, background: C.paper }}>
        <div style={{ position: 'absolute', width: 390, height: 844, transform: `scale(${s})`, transformOrigin: '0 0' }}>{children}</div>
        <div style={{ position: 'absolute', top: 11 * s, left: '50%', width: 124 * s, height: 36 * s, marginLeft: -62 * s, borderRadius: 99, background: '#000' }} />
      </div>
    </div>
  )
}

// ——— Marca ———
/** Logo de la app (silueta) teñido de `color`. */
export function Logo({ size = 200, color = C.paper, style }) {
  const url = `url(${staticFile('logo.png')})`
  return (
    <div
      style={{
        width: size,
        height: size * (672 / 620),
        background: color,
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        ...style,
      }}
    />
  )
}

/** Icono de la app, como en una notificación. */
export function AppIcon({ size = 40, style }) {
  return <Img src={staticFile('icon.png')} style={{ width: size, height: size, borderRadius: size * 0.225, ...style }} />
}

// ——— Fondos ———
export function PaperGround({ glow = 'rgba(255,255,255,.9)' }) {
  return <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 60% at 50% 40%, ${glow} 0%, ${C.paper} 55%, ${C.paper2} 100%)` }} />
}
export function NightGround({ glow = 0.18 }) {
  return (
    <AbsoluteFill
      style={{ background: `radial-gradient(ellipse 60% 50% at 50% 55%, rgba(212,95,50,${glow}) 0%, rgba(212,95,50,0) 60%), radial-gradient(ellipse at 50% 50%, ${C.night2} 0%, ${C.night} 70%)` }}
    />
  )
}

/** Fundido de entrada/salida de una escena completa. */
export function Fade({ inDur = 14, outAt, outDur = 14, children, color }) {
  const frame = useCurrentFrame()
  const a = prog(frame, 0, inDur, inOut)
  const z = outAt === undefined ? 0 : prog(frame, outAt, outDur, inOut)
  return (
    <AbsoluteFill>
      {children}
      {color && <AbsoluteFill style={{ background: color, opacity: Math.max(1 - a, z) }} />}
      {!color && <AbsoluteFill style={{ opacity: 0 }} />}
    </AbsoluteFill>
  )
}

export const sec = (s) => Math.round(s * FPS)
