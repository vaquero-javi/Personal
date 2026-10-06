// Vídeo de lanzamiento de CHRONOS: diez escenas sobre la música (src/timeline.js).
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { MAC_PING, PINGS, SCENES, b } from './timeline.js'
import {
  AppIcon,
  C,
  F,
  Footage,
  Headline,
  IPad,
  IPhone,
  Logo,
  Mac,
  NightGround,
  PaperGround,
  Still,
  Words,
  accel,
  inOut,
  keys,
  mix,
  out,
  prog,
} from './ui.jsx'

const OV = 18 // fotogramas de fundido cruzado entre escenas

export function Launch() {
  const scene = (name, Component, { overlap = true } = {}) => {
    const [s, e] = SCENES[name]
    const from = b(s) - (overlap && s > 0 ? OV : 0)
    return (
      <Sequence key={name} from={from} durationInFrames={b(e) - from + OV} name={name}>
        <CrossIn skip={!overlap || s === 0} lead={overlap && s > 0 ? OV : 0}>
          <Component />
        </CrossIn>
      </Sequence>
    )
  }
  return (
    <AbsoluteFill style={{ background: C.night }}>
      {scene('open', Open)}
      {scene('logo', LogoReveal, { overlap: false })}
      {scene('hero', Hero)}
      {scene('event', EventScene)}
      {scene('phone', Phone)}
      {scene('plan', Plan)}
      {scene('write', Write)}
      {scene('ai', Ai)}
      {scene('devices', Devices)}
      {scene('end', End)}
      <Audio src={staticFile('audio.wav')} />
    </AbsoluteFill>
  )
}

/** Fundido de entrada de la escena; desplaza su reloj para que el fotograma 0 sea el pulso de inicio. */
function CrossIn({ skip, lead, children }) {
  const frame = useCurrentFrame()
  const o = skip ? 1 : prog(frame, 0, lead, inOut)
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Sequence from={lead} layout="none">
        {children}
      </Sequence>
    </AbsoluteFill>
  )
}

// ——— Utilidades de cámara y dispositivos ———
/** Lleva el punto `focus` del lienzo a `target` con zoom `z`. */
function Camera({ z = 1, focus = [960, 540], target = [960, 540], children }) {
  const tx = target[0] - focus[0] * z
  const ty = target[1] - focus[1] * z
  return <AbsoluteFill style={{ transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>{children}</AbsoluteFill>
}

/** Recorrido de cámara por fotogramas clave: [[f, z, x, y], …] con x, y en px del lienzo. */
function cam(frame, path) {
  const fs = path.map((p) => p[0])
  return {
    z: keys(frame, fs, path.map((p) => p[1])),
    focus: [keys(frame, fs, path.map((p) => p[2])), keys(frame, fs, path.map((p) => p[3]))],
  }
}

/** Geometría de un Mac de pantalla `W` colocado con su borde superior en `top`. */
function macGeom(W, top) {
  const s = W / 1440
  const bezel = 22 * s
  const left = (1920 - (W + 2 * bezel)) / 2
  return { W, s, left, top, pt: ([x, y]) => [left + bezel + x * s, top + bezel * 1.25 + y * s] }
}
function ipadGeom(W, top) {
  const s = W / 1180
  const bezel = 26 * s
  const left = (1920 - (W + 2 * bezel)) / 2
  return { W, s, left, top, pt: ([x, y]) => [left + bezel + x * s, top + bezel + y * s] }
}

/** Entrada de dispositivo: sube y se endereza en 3D. */
function rise(frame, at, dur = 60, { y = 520, rx = 30, scale = 0.9 } = {}) {
  const p = prog(frame, at, dur, out)
  return {
    transform: `translateY(${(1 - p) * y}px) rotateX(${(1 - p) * rx}deg) scale(${mix(scale, 1, p)})`,
    opacity: Math.min(1, p * 2.5),
  }
}

/** Píldora de texto sobre la grabación, abajo. */
function Caption({ text, at, exitAt, dark = true, bottom = 70 }) {
  const frame = useCurrentFrame()
  const p = prog(frame, at, 30)
  const z = exitAt === undefined ? 0 : prog(frame, exitAt, 20, accel)
  if (p === 0 || z === 1) return null
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom, display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          padding: '18px 34px',
          borderRadius: 999,
          background: dark ? 'rgba(28,27,24,.82)' : 'rgba(253,252,250,.86)',
          color: dark ? C.paper : C.ink,
          fontFamily: F.sans,
          fontWeight: 500,
          fontSize: 34,
          letterSpacing: '-0.015em',
          boxShadow: '0 20px 50px -20px rgba(0,0,0,.4)',
          backdropFilter: 'blur(18px)',
          opacity: p * (1 - z),
          transform: `translateY(${(1 - p) * 30 - z * 10}px) scale(${mix(0.96, 1, p)})`,
          filter: `blur(${(1 - p) * 8}px)`,
        }}
      >
        {text}
      </div>
    </div>
  )
}

// ═══════════ 1. Apertura: el punto del "ahora" recorre el día ═══════════
function Open() {
  const f = useCurrentFrame()
  const trackW = 760
  const trackX = 960 - trackW / 2
  const y = 640
  const dotIn = prog(f, b(0.5), 30)
  const line = prog(f, b(1.2), b(1.4))
  const run = prog(f, b(2), b(3), inOut)
  const pct = 0.4 * run
  const minutes = Math.round((9 * 60 + 41) * run)
  const clock = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  // Final: la pista se recoge y el punto viaja al centro.
  const gather = prog(f, b(8.6), b(1.4), inOut)
  const dotX = mix(trackX + trackW * pct, 960, gather)
  const dotY = mix(y, 540, gather)
  const trackFade = 1 - prog(f, b(8.4), b(0.8), inOut)
  const pulse = 1 + 0.25 * Math.max(0, Math.sin((f / b(1)) * Math.PI * 2)) * (1 - gather)
  return (
    <AbsoluteFill>
      <NightGround glow={0.1 * dotIn} />
      <div style={{ position: 'absolute', left: trackX, top: y - 1.5, width: trackW * line, height: 3, borderRadius: 3, background: 'rgba(255,255,255,.14)', opacity: trackFade }} />
      <div style={{ position: 'absolute', left: trackX, top: y - 1.5, width: trackW * pct, height: 3, borderRadius: 3, background: C.paper, opacity: trackFade }} />
      <div
        style={{
          position: 'absolute',
          left: trackX - 110,
          top: y - 14,
          fontFamily: F.mono,
          fontSize: 24,
          color: C.ink4,
          opacity: line * trackFade,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {clock}
      </div>
      <div style={{ position: 'absolute', left: trackX + trackW + 34, top: y - 14, fontFamily: F.mono, fontSize: 24, color: C.ink5, opacity: line * trackFade }}>
        {Math.round(pct * 100)}% del día
      </div>
      <div
        style={{
          position: 'absolute',
          left: dotX - 11,
          top: dotY - 11,
          width: 22,
          height: 22,
          borderRadius: 99,
          background: C.ember,
          opacity: dotIn,
          transform: `scale(${dotIn * pulse})`,
          boxShadow: `0 0 0 8px rgba(212,95,50,.18), 0 0 60px 14px rgba(212,95,50,${0.45 * dotIn})`,
        }}
      />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingBottom: 260 }}>
        <Headline a="Tu tiempo," b="por fin en orden." at={b(4.3)} gap={b(1.3)} exitAt={b(8.2)} color={C.paper} accent={C.ember3} size={128} />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ═══════════ 2. Logo: el punto se abre y revela la marca ═══════════
function LogoReveal() {
  const f = useCurrentFrame()
  const open = prog(f, b(0.2), b(1.5), out)
  const r = mix(0, 520, open)
  const word = prog(f, b(1.3), b(2))
  const sub = prog(f, b(2.6), b(1.2))
  const leave = prog(f, b(5), b(1), accel)
  return (
    <AbsoluteFill>
      <NightGround glow={0.22 * (1 - leave)} />
      <AbsoluteFill style={{ transform: `scale(${mix(1, 1.6, leave)})`, opacity: 1 - leave, filter: `blur(${leave * 16}px)` }}>
        <div
          style={{
            position: 'absolute',
            left: 960 - 11,
            top: 540 - 11,
            width: 22,
            height: 22,
            borderRadius: 99,
            background: C.ember,
            transform: `scale(${1 + open * 26})`,
            opacity: 1 - open,
          }}
        />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', clipPath: `circle(${r}px at 960px 540px)` }}>
          <div style={{ transform: `translateY(${-word * 70}px) scale(${mix(1.25, 1, open)})`, filter: `blur(${(1 - open) * 10}px)` }}>
            <Logo size={260} color={C.paper} />
          </div>
        </AbsoluteFill>
        <div
          style={{
            position: 'absolute',
            top: 720,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: F.sans,
            fontWeight: 600,
            fontSize: 64,
            color: C.paper,
            letterSpacing: `${mix(0.9, 0.3, word)}em`,
            paddingLeft: `${mix(0.9, 0.3, word)}em`,
            opacity: word,
            filter: `blur(${(1 - word) * 12}px)`,
          }}
        >
          CHRONOS
        </div>
        <div
          style={{
            position: 'absolute',
            top: 820,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: F.mono,
            fontSize: 22,
            letterSpacing: '0.28em',
            color: C.ink4,
            opacity: sub,
            transform: `translateY(${(1 - sub) * 14}px)`,
          }}
        >
          CALENDARIO · RECORDATORIOS · DOCUMENTOS
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ═══════════ 3. Héroe: el Mac aparece con el inicio de la app ═══════════
function Hero() {
  const f = useCurrentFrame()
  const g = macGeom(1300, 300)
  const c = cam(f, [
    [b(4.4), 1, 960, 540],
    [b(7.6), 1.75, ...g.pt([560, 175])],
    [b(8.4), 1.75, ...g.pt([560, 175])],
    [b(11.6), 1.5, ...g.pt([760, 520])],
  ])
  return (
    <AbsoluteFill>
      <PaperGround />
      <Camera {...c}>
        <div style={{ position: 'absolute', top: 70, left: 0, right: 0 }}>
          <Headline a="Tu día," b="de un vistazo." at={b(0.5)} gap={b(0.9)} exitAt={b(4.2)} size={88} style={{ display: 'flex', gap: 22, justifyContent: 'center', alignItems: 'baseline' }} />
        </div>
        <div style={{ position: 'absolute', left: g.left, top: g.top, perspective: 2600, perspectiveOrigin: '50% 0%' }}>
          <div style={{ ...rise(f, b(0.6), b(2.6)), transformOrigin: '50% 100%' }}>
            <Mac width={g.W}>
              <Footage scene="home" map={[[b(2.2), 0], [b(2.2) + 90, 1150]]} />
            </Mac>
          </div>
        </div>
      </Camera>
    </AbsoluteFill>
  )
}

// ═══════════ 4. Nuevo evento con avisos ═══════════
function EventScene() {
  const f = useCurrentFrame()
  const g = macGeom(1240, 92)
  const P = (x, y) => g.pt([x, y])
  const c = cam(f, [
    [0, 1, 960, 540],
    [36, 1, 960, 540],
    [76, 1.5, ...P(720, 250)],
    [122, 1.5, ...P(720, 250)],
    [160, 1.5, ...P(720, 340)],
    [186, 1.5, ...P(720, 340)],
    [222, 1.5, ...P(720, 520)],
    [276, 1.5, ...P(720, 520)],
    [312, 1.5, ...P(720, 700)],
    [356, 1.5, ...P(720, 700)],
    [400, 1, 960, 540],
  ])
  const ping = b(MAC_PING - SCENES.event[0])
  return (
    <AbsoluteFill>
      <PaperGround />
      <Camera {...c}>
        <div style={{ position: 'absolute', left: g.left, top: g.top }}>
          <Mac width={g.W}>
            <Footage scene="event" map={[[0, 1600], [396, 16400]]} />
            <MacBanner at={ping} />
          </Mac>
        </div>
      </Camera>
      <Caption text="Crea un evento en segundos." at={50} exitAt={170} />
      <Caption text="Y elige cuándo quieres que te avise." at={196} exitAt={350} />
    </AbsoluteFill>
  )
}

/** Notificación de macOS dentro de la pantalla del Mac (coordenadas de la web, 1440×900). */
function MacBanner({ at }) {
  const f = useCurrentFrame()
  const p = prog(f, at, 34)
  if (p === 0) return null
  return (
    <div
      style={{
        position: 'absolute',
        top: 18,
        right: 18,
        width: 372,
        padding: '14px 16px',
        borderRadius: 18,
        background: 'rgba(246,245,241,.92)',
        boxShadow: '0 18px 40px -12px rgba(0,0,0,.35), 0 0 0 1px rgba(0,0,0,.06)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        transform: `translateX(${(1 - p) * 420}px)`,
        fontFamily: F.sans,
        color: C.ink,
      }}
    >
      <AppIcon size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
          Cena con el equipo <span style={{ fontWeight: 400, color: C.ink5 }}>ahora</span>
        </div>
        <div style={{ fontSize: 13, color: '#44413b', marginTop: 2 }}>Hoy a las 21:00 · dentro de 1 hora</div>
      </div>
    </div>
  )
}

// ═══════════ 5. Avisos en el iPhone ═══════════
const NOTIFS = [
  { title: 'Clase de Bioquímica', body: 'Empieza en 30 min · Aula 2.14', when: 'ahora' },
  { title: 'Entregar práctica de Estadística', body: 'Hoy a las 12:30', when: 'hace 1 min' },
  { title: 'Examen parcial de Biología', body: 'Mañana a las 9:00 · aviso 1 día antes', when: 'hace 2 min' },
]

function Phone() {
  const f = useCurrentFrame()
  const start = SCENES.phone[0]
  const enter = prog(f, b(0.2), b(2.2), out)
  return (
    <AbsoluteFill>
      <NightGround glow={0.2} />
      <div style={{ position: 'absolute', left: 150, top: 390, width: 1000, textAlign: 'left' }}>
        <Words text="Avisos que llegan." at={b(0.6)} style={{ justifyContent: 'flex-start', fontFamily: F.sans, fontWeight: 600, fontSize: 92, letterSpacing: '-0.035em', color: C.paper }} />
        <Words
          text="Al móvil y al ordenador."
          at={b(1.6)}
          style={{ justifyContent: 'flex-start', fontFamily: F.serif, fontStyle: 'italic', fontSize: 88, color: C.ember3, marginTop: 6 }}
        />
      </div>
      <div style={{ position: 'absolute', left: 1180, top: 90, perspective: 2000 }}>
        <div
          style={{
            transform: `translateY(${(1 - enter) * 600}px) rotateY(${mix(-24, -8, enter)}deg) rotateX(${mix(10, 0, enter)}deg) rotateZ(${mix(4, 0, enter)}deg)`,
            opacity: Math.min(1, enter * 2),
          }}
        >
          <IPhone width={410}>
            <LockScreen pings={PINGS.map((p) => b(p - start))} />
          </IPhone>
        </div>
      </div>
    </AbsoluteFill>
  )
}

function LockScreen({ pings }) {
  const f = useCurrentFrame()
  const H = 104 // alto de cada notificación + hueco
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(ellipse 120% 70% at 50% 110%, #d45f32 0%, #7a2e17 35%, #241612 70%, #120c0a 100%)',
        fontFamily: F.sans,
        color: 'white',
      }}
    >
      <div style={{ position: 'absolute', top: 74, width: '100%', textAlign: 'center', fontSize: 19, fontWeight: 500, opacity: 0.85 }}>martes, 6 de octubre</div>
      <div style={{ position: 'absolute', top: 92, width: '100%', textAlign: 'center', fontSize: 104, fontWeight: 600, letterSpacing: '-0.04em', opacity: 0.95 }}>9:41</div>
      {NOTIFS.map((n, i) => {
        const p = prog(f, pings[i], 30)
        if (p === 0) return null
        // Las nuevas entran arriba y empujan a las anteriores hacia abajo.
        const below = pings.slice(i + 1).reduce((acc, at) => acc + prog(f, at, 30), 0)
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              top: 300 + below * H,
              padding: '13px 14px',
              borderRadius: 22,
              background: 'rgba(250,245,240,.78)',
              backdropFilter: 'blur(24px)',
              color: C.ink,
              display: 'flex',
              gap: 11,
              opacity: p,
              transform: `translateY(${(1 - p) * -40}px) scale(${mix(0.92, 1, p)})`,
            }}
          >
            <AppIcon size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</span>
                <span style={{ fontWeight: 400, color: C.ink5, fontSize: 13, marginLeft: 8, flexShrink: 0 }}>{n.when}</span>
              </div>
              <div style={{ fontSize: 14, color: '#44413b', marginTop: 2 }}>{n.body}</div>
            </div>
          </div>
        )
      })}
      <div style={{ position: 'absolute', bottom: 10, left: '50%', width: 140, height: 5, marginLeft: -70, borderRadius: 9, background: 'rgba(255,255,255,.8)' }} />
    </AbsoluteFill>
  )
}

// ═══════════ 6. Calendario y timeline ═══════════
function Window({ children, w = 1440, h = 900, crop = [0, 0], scale = 1, style }) {
  return (
    <div
      style={{
        width: w * scale,
        height: h * scale,
        borderRadius: 26,
        overflow: 'hidden',
        background: C.paper,
        boxShadow: '0 0 0 1px rgba(28,27,24,.08), 0 50px 100px -30px rgba(44,36,24,.45)',
        position: 'relative',
        ...style,
      }}
    >
      <div style={{ position: 'absolute', left: -crop[0] * scale, top: -crop[1] * scale, width: 1440, height: 900, transform: `scale(${scale})`, transformOrigin: '0 0' }}>{children}</div>
    </div>
  )
}

function Plan() {
  const f = useCurrentFrame()
  const swap = prog(f, b(5.7), b(1.2), inOut)
  const calIn = prog(f, b(0.3), b(2.4), out)
  const tlIn = prog(f, b(5.9), b(2), out)
  return (
    <AbsoluteFill>
      <PaperGround />
      {/* A · Calendario */}
      <AbsoluteFill style={{ opacity: 1 - swap, transform: `translateX(${-swap * 300}px)` }}>
        <div style={{ position: 'absolute', top: 64, left: 0, right: 0 }}>
          <Words
            text="Mes. Semana. Día."
            at={b(0.5)}
            stagger={b(0.5)}
            style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 92, letterSpacing: '-0.035em', color: C.ink }}
            wordStyle={(w, i) => (i === 2 ? { fontFamily: F.serif, fontStyle: 'italic', fontWeight: 400, color: C.ember, fontSize: '1.08em' } : {})}
          />
        </div>
        <div style={{ position: 'absolute', left: 960 - 1440 * 0.8 / 2, top: 230, perspective: 2400 }}>
          <div
            style={{
              transform: `translateY(${(1 - calIn) * 400}px) rotateX(${mix(26, 4, calIn) - prog(f, b(2), b(4), inOut) * 4}deg) scale(${mix(0.9, 1, calIn)})`,
              transformOrigin: '50% 100%',
              opacity: Math.min(1, calIn * 2),
            }}
          >
            <Window scale={0.8}>
              <Footage scene="calendar" map={[[b(0.6), 0], [b(6), 5600]]} />
            </Window>
          </div>
        </div>
      </AbsoluteFill>
      {/* B · Timeline */}
      <AbsoluteFill style={{ opacity: swap, transform: `translateX(${(1 - swap) * 200}px)` }}>
        <div style={{ position: 'absolute', left: 170, top: 400, width: 700 }}>
          <Words text="Lo que pasó." at={b(6.3)} style={{ justifyContent: 'flex-start', fontFamily: F.sans, fontWeight: 600, fontSize: 92, letterSpacing: '-0.035em', color: C.ink }} />
          <Words
            text="Lo que viene."
            at={b(7.3)}
            style={{ justifyContent: 'flex-start', fontFamily: F.serif, fontStyle: 'italic', fontSize: 100, color: C.ember, marginTop: 4 }}
          />
        </div>
        <div style={{ position: 'absolute', left: 930, top: 70, perspective: 2400 }}>
          <div style={{ transform: `translateY(${(1 - tlIn) * 300}px) rotateY(${mix(-14, -5, tlIn)}deg)`, opacity: Math.min(1, tlIn * 2) }}>
            <Window w={820} h={900} crop={[290, 0]} scale={1.04}>
              <Footage scene="timeline" map={[[b(6.2), 0], [b(9.8), 4900], [b(9.8) + 1, 14300], [b(12), 15300]]} />
            </Window>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ═══════════ 7. iPad: apuntes a mano ═══════════
function Write() {
  const f = useCurrentFrame()
  const g = ipadGeom(1300, 70)
  const enter = prog(f, b(2), b(2.4), out)
  const c = cam(f, [
    [b(2.6), 1.75, ...g.pt([470, 175])],
    [b(6.4), 1.75, ...g.pt([520, 200])],
    [b(9.2), 1, 960, 540],
  ])
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 60% at 50% 45%, #ffffff 0%, ${C.paper} 50%, #e4e1d9 100%)` }} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Headline a="Escribe a mano." b="Como en papel." at={b(0.2)} gap={b(0.9)} exitAt={b(2)} size={110} />
      </AbsoluteFill>
      <Camera {...c}>
        <div style={{ position: 'absolute', left: g.left, top: g.top, perspective: 2600 }}>
          <div style={{ transform: `translateY(${(1 - enter) * 700}px) rotateX(${(1 - enter) * 28}deg) scale(${mix(0.85, 1, enter)})`, opacity: Math.min(1, enter * 2.5) }}>
            <IPad width={g.W}>
              <Footage
                scene="write"
                map={[
                  [b(2.8), 600],
                  [b(6.4), 11000],
                  [b(12.4), 64300],
                ]}
              />
            </IPad>
          </div>
        </div>
      </Camera>
      <Caption text="Con la presión del Apple Pencil, marcador y goma." at={b(9.6)} exitAt={b(13.4)} />
    </AbsoluteFill>
  )
}

// ═══════════ 8. Estudiar con IA ═══════════
function Ai() {
  const f = useCurrentFrame()
  const g = macGeom(1240, 92)
  const enter = prog(f, b(1.9), b(2.2), out)
  const c = cam(f, [
    [b(3.6), 1, 960, 540],
    [b(4.5), 1.7, ...g.pt([1232, 760])],
    [b(6), 1.7, ...g.pt([1232, 760])],
    [b(6.9), 1.7, ...g.pt([1232, 400])],
    [b(9.6), 1.7, ...g.pt([1232, 470])],
    [b(10.1), 1.6, ...g.pt([1232, 330])],
  ])
  const cards = f >= b(10.1)
  return (
    <AbsoluteFill>
      <PaperGround glow="rgba(255,236,224,1)" />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Headline a="Estudia con IA." b="Sobre tus propios apuntes." at={b(0.2)} gap={b(0.9)} exitAt={b(2)} size={104} />
      </AbsoluteFill>
      <Camera {...c}>
        <div style={{ position: 'absolute', left: g.left, top: g.top, perspective: 2600 }}>
          <div style={{ transform: `translateY(${(1 - enter) * 600}px) rotateX(${(1 - enter) * 26}deg) scale(${mix(0.88, 1, enter)})`, opacity: Math.min(1, enter * 2.5) }}>
            <Mac width={g.W}>
              {cards ? (
                <Footage scene="cards" map={[[b(10.1), 4300], [b(12), 5900]]} />
              ) : (
                <Footage scene="study" map={[[b(2.6), 1300], [b(3.7), 4700], [b(6.1), 10000], [b(9.5), 15600], [b(10.1), 17500]]} />
              )}
            </Mac>
          </div>
        </div>
      </Camera>
      <Caption text="Pregúntale. Resume. Hazte un examen. Repasa con tarjetas." at={b(6.6)} exitAt={b(11.4)} />
    </AbsoluteFill>
  )
}

// ═══════════ 9. Claro y oscuro, en todos los dispositivos ═══════════
function DeviceSet({ dark }) {
  const f = useCurrentFrame()
  const drift = prog(f, 0, b(10), inOut)
  const mac = rise(f, 0, b(2), { y: 500, rx: 20 })
  const pad = rise(f, b(0.4), b(2), { y: 600, rx: 16 })
  const phone = rise(f, b(0.8), b(2), { y: 700, rx: 12 })
  return (
    <AbsoluteFill>
      {dark ? <NightGround glow={0.16} /> : <PaperGround />}
      <AbsoluteFill style={{ transform: `scale(${mix(1, 1.05, drift)})` }}>
        <div style={{ position: 'absolute', top: 70, left: 0, right: 0 }}>
          <Headline a="De día. De noche." at={b(0.6)} exitAt={b(5.6)} size={84} color={dark ? C.paper : C.ink} />
        </div>
        <div style={{ position: 'absolute', top: 70, left: 0, right: 0 }}>
          <Headline a="En todos tus dispositivos." at={b(6)} size={84} color={dark ? C.paper : C.ink} />
        </div>
        <div style={{ position: 'absolute', left: 960 - 520, top: 250, perspective: 2400 }}>
          <div style={{ ...mac, transformOrigin: '50% 100%' }}>
            <Mac width={1000}>
              <Still name={dark ? 'home-dark' : 'home'} width={1440} height={900} />
            </Mac>
          </div>
        </div>
        <div style={{ position: 'absolute', left: 120, top: 560, perspective: 2000 }}>
          <div style={{ ...pad, transform: `${pad.transform} translateX(${-drift * 20}px)` }}>
            <IPad width={560}>
              <Still name={dark ? 'ipad-note-dark' : 'ipad-note-full'} width={1180} height={820} />
            </IPad>
          </div>
        </div>
        <div style={{ position: 'absolute', left: 1500, top: 470, perspective: 2000 }}>
          <div style={{ ...phone, transform: `${phone.transform} translateX(${drift * 20}px)` }}>
            <IPhone width={250} dark={dark}>
              <Still name={dark ? 'iphone-home-dark' : 'iphone-home'} width={390} height={844} />
            </IPhone>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function Devices() {
  const f = useCurrentFrame()
  // Barrido diagonal de claro a oscuro.
  const w = prog(f, b(3.6), b(1.8), inOut)
  const x = mix(-500, 2420, w)
  const clip = `polygon(0 0, ${x + 300}px 0, ${x - 300}px 1080px, 0 1080px)`
  return (
    <AbsoluteFill>
      <DeviceSet dark={false} />
      <AbsoluteFill style={{ clipPath: clip }}>
        <DeviceSet dark />
      </AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `polygon(${x + 296}px 0, ${x + 304}px 0, ${x - 296}px 1080px, ${x - 304}px 1080px)`, background: C.ember3, opacity: w > 0 && w < 1 ? 0.7 : 0 }} />
    </AbsoluteFill>
  )
}

// ═══════════ 10. Cierre ═══════════
function End() {
  const f = useCurrentFrame()
  const logo = prog(f, b(0.3), b(2))
  const word = prog(f, b(1.4), b(1.8))
  const url = prog(f, b(5), b(1.2))
  const fadeOut = prog(f, b(10.4), b(1.6), inOut)
  const breathe = 1 + 0.02 * Math.sin((f / b(4)) * Math.PI * 2)
  return (
    <AbsoluteFill style={{ opacity: 1 - fadeOut }}>
      <NightGround glow={0.2 * logo} />
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 170 }}>
        <div style={{ opacity: logo, transform: `scale(${mix(0.92, 1, logo) * breathe})`, filter: `blur(${(1 - logo) * 14}px)` }}>
          <Logo size={190} color={C.paper} />
        </div>
        <div
          style={{
            marginTop: 40,
            fontFamily: F.sans,
            fontWeight: 600,
            fontSize: 54,
            color: C.paper,
            letterSpacing: `${mix(0.7, 0.3, word)}em`,
            paddingLeft: `${mix(0.7, 0.3, word)}em`,
            opacity: word,
            filter: `blur(${(1 - word) * 10}px)`,
          }}
        >
          CHRONOS
        </div>
        <Words text="Tu tiempo, en orden." at={b(2.8)} style={{ marginTop: 18, fontFamily: F.serif, fontStyle: 'italic', fontSize: 64, color: C.ember3 }} />
        <div style={{ marginTop: 56, textAlign: 'center', opacity: url, transform: `translateY(${(1 - url) * 16}px)` }}>
          <div style={{ fontFamily: F.sans, fontSize: 24, color: C.ink4, letterSpacing: '0.02em' }}>Ya disponible en la web. Instálala en tu móvil.</div>
          <div style={{ marginTop: 10, fontFamily: F.mono, fontSize: 26, color: C.paper, letterSpacing: '0.04em' }}>chronos-crm.vercel.app</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
