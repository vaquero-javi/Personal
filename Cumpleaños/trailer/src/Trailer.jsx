import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { BEAT, COLD_LINES, SCENES, WIPES, b } from './timeline.js'
import {
  C,
  Camera,
  Crt,
  F,
  Footage,
  Ground,
  Hud,
  LevelTag,
  PixelIcon,
  PixelWipe,
  Pop,
  Scrim,
  blink,
  dialogFrame,
  extrude,
  notch,
  smooth,
  stepped,
} from './ui.jsx'

const len = ([s, e]) => b(e) - b(s)
const Scene = ({ name, children }) => (
  <Sequence from={b(SCENES[name][0])} durationInFrames={len(SCENES[name])} name={name}>
    {children}
  </Sequence>
)

// ——— 1. Arranque: INSERT COIN → encendido CRT → "Esta vez no hay regalos sin esfuerzo" ———
function ColdOpen() {
  const frame = useCurrentFrame()
  const coin = b(4)
  // Encendido CRT (la única animación suave de la marca): línea que se abre en pantalla.
  const open = interpolate(frame, [coin, coin + 9], [0.004, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: smooth })
  const flash = frame >= coin && frame < coin + 3
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {frame < coin && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 36 }}>
          <div style={{ fontFamily: F.label, fontSize: 40, color: C.gold, letterSpacing: 4, opacity: blink(frame, 20) ? 1 : 0 }}>INSERT COIN</div>
          <div style={{ fontFamily: F.label, fontSize: 18, color: C.paperDim, opacity: 0.7 }}>CRÉDITOS 0</div>
        </AbsoluteFill>
      )}
      {frame >= coin && (
        <AbsoluteFill style={{ transform: `scaleY(${open})`, background: flash ? C.paper : C.ink, overflow: 'hidden' }}>
          <Ground />
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
            {COLD_LINES.map((l) => (
              <Pop key={l.text} at={b(l.at)} dur={5}>
                <div
                  style={{
                    fontFamily: F.display,
                    fontSize: l.accent ? 250 : 190,
                    lineHeight: 0.86,
                    textTransform: 'uppercase',
                    color: l.accent ? C.gold : C.paper,
                    textShadow: extrude(10, l.accent ? 'gold' : 'pink'),
                    textAlign: 'center',
                  }}
                >
                  {l.text}
                  {l.accent && <span style={{ opacity: blink(frame, 16) ? 1 : 0.15 }}>...</span>}
                </div>
              </Pop>
            ))}
          </AbsoluteFill>
          <Crt />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}

// ——— 2. La intro real de la web: foto, título y máquina de escribir ———
function IntroScene() {
  const d = len(SCENES.intro)
  return (
    <>
      <Camera from={{ s: 1.18, x: 960, y: 470 }} to={{ s: 1.02, x: 960, y: 540 }} dur={d}>
        <Footage scene="intro" from={1150} speed={1.25} />
      </Camera>
    </>
  )
}

// ——— 3. Rótulo: 3 niveles, 3 sorpresas ———
function LevelsCard() {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill>
      <Ground />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 26 }}>
        <Pop at={2} dur={5}>
          <div style={{ fontFamily: F.display, fontSize: 230, lineHeight: 0.84, color: C.paper, textTransform: 'uppercase', textShadow: extrude(10) }}>3 niveles</div>
        </Pop>
        <Pop at={b(1.5)} dur={5}>
          <div style={{ fontFamily: F.display, fontSize: 230, lineHeight: 0.84, color: C.gold, textTransform: 'uppercase', textShadow: extrude(10, 'gold') }}>3 sorpresas</div>
        </Pop>
        <div style={{ display: 'flex', gap: 28, marginTop: 30, height: 48 }}>
          {[0, 1, 2].map((i) =>
            frame >= b(2.2) + i * 4 ? <PixelIcon key={i} name="heart" size={8} color={C.pink} style={{ filter: `drop-shadow(0 8px 0 ${C.pinkDeep})` }} /> : <div key={i} style={{ width: 56 }} />,
          )}
        </div>
      </AbsoluteFill>
      <Crt />
    </AbsoluteFill>
  )
}

// ——— 4. Selector de niveles: la máquina recreativa ———
function SelectScene() {
  return (
    <Camera from={{ s: 1.32, x: 960, y: 520 }} to={{ s: 1.16, x: 960, y: 560 }} dur={len(SCENES.select)}>
      <Footage scene="select" from={250} speed={1.05} />
    </Camera>
  )
}

// ——— 5–7. Los tres niveles jugándose de verdad ———
function LevelScene({ scene, speed, from = 0, focus, number, name, detail }) {
  const d = len(SCENES[scene === 'sopa' ? 'sopa' : scene])
  return (
    <AbsoluteFill>
      <Camera from={{ s: 1.0, x: 960, y: 540 }} to={focus} dur={d * 0.75}>
        <Footage scene={scene} from={from} speed={speed} />
      </Camera>
      <Scrim side="left" amount={1} />
      <LevelTag number={number} name={name} detail={detail} at={4} />
    </AbsoluteFill>
  )
}

// ——— 8. Móvil y ordenador ———
function Phone({ src, at, x, tilt, floatSeed }) {
  const frame = useCurrentFrame()
  const q = stepped(frame, at, 8, 4)
  if (q === 0) return null
  const float = Math.round(Math.sin((frame + floatSeed) / 18) * 3) * 4 // flota en saltos de 4px
  const W = 280
  const H = Math.round((W * 2532) / 1170)
  return (
    <div
      style={{
        position: 'absolute',
        left: x - W / 2 - 16,
        top: 540 - H / 2 - 16 + (1 - q) * 160 + float,
        padding: 12,
        background: C.ink2,
        border: `4px solid ${C.pink}`,
        clipPath: notch(8),
        transform: `rotate(${tilt}deg)`,
        boxShadow: `inset 0 0 0 4px ${C.ink}`,
      }}
    >
      <Img src={staticFile(`cap/${src}.png`)} style={{ width: W, height: H, display: 'block' }} />
    </div>
  )
}

function PhonesScene() {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill>
      <Ground />
      <div style={{ position: 'absolute', left: 110, top: 300 }}>
        <Pop at={3} dur={5} from={0.7} style={{ transformOrigin: 'left center' }}>
          <div style={{ fontFamily: F.display, fontSize: 124, lineHeight: 0.86, color: C.paper, textTransform: 'uppercase', textShadow: extrude(8) }}>En el móvil</div>
        </Pop>
        <Pop at={b(1.5)} dur={5} from={0.7} style={{ transformOrigin: 'left center' }}>
          <div style={{ fontFamily: F.display, fontSize: 124, lineHeight: 0.86, color: C.gold, textTransform: 'uppercase', textShadow: extrude(8, 'gold'), marginTop: 18 }}>
            y en el ordenador
          </div>
        </Pop>
        {frame >= b(3) && (
          <div style={{ marginTop: 48, fontFamily: F.label, fontSize: 20, color: C.paperDim, textTransform: 'uppercase', lineHeight: 1.6 }}>
            Toca, arrastra y gira<span style={{ color: C.gold, opacity: blink(frame) ? 1 : 0 }}> _</span>
          </div>
        )}
      </div>
      <Phone src="phone-sopa" at={b(0.5)} x={1160} tilt={0} floatSeed={0} />
      <Phone src="phone-select" at={b(1)} x={1450} tilt={0} floatSeed={20} />
      <Phone src="phone-blocks" at={b(1.5)} x={1740} tilt={0} floatSeed={40} />
      <Crt strength={0.8} />
    </AbsoluteFill>
  )
}

// ——— 9. ¡Nivel superado! ———
function WinScene() {
  const frame = useCurrentFrame()
  // Corazones pixel que suben a saltos alrededor del cartel.
  const hearts = Array.from({ length: 14 }, (_, i) => {
    const start = 12 + i * 3
    if (frame < start) return null
    const life = frame - start
    const x = i % 2 === 0 ? 70 + ((i * 131) % 380) : 1440 + ((i * 173) % 400)
    const y = 980 - Math.floor(life / 3) * 24
    return <PixelIcon key={i} name="heart" size={i % 3 === 0 ? 10 : 6} color={i % 4 === 0 ? C.gold : C.pink} style={{ position: 'absolute', left: x, top: y, opacity: y < 120 ? 0 : 1 }} />
  })
  return (
    <AbsoluteFill>
      <Camera from={{ s: 1.0, x: 960, y: 540 }} to={{ s: 1.45, x: 960, y: 535 }} dur={b(3)} delay={6}>
        <Footage scene="sopa-win" from={900} speed={1} />
      </Camera>
      {hearts}
    </AbsoluteFill>
  )
}

// ——— 10. Cierre: ¡Feliz cumpleaños, mi vida! ———
function EndCard() {
  const frame = useCurrentFrame()
  const total = len(SCENES.end)
  const kb = interpolate(frame, [0, total], [1.3, 1.22], { easing: smooth })
  // Apagado CRT al final: se cierra en una línea y luego en un punto.
  const offStart = total - 22
  const offY = interpolate(frame, [offStart, offStart + 7], [1, 0.006], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: smooth })
  const offX = interpolate(frame, [offStart + 7, offStart + 13], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: smooth })
  const startAt = b(7)
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ transform: `scale(${offX}, ${offY})`, overflow: 'hidden', background: frame > offStart + 5 ? C.paper : C.ink }}>
        <AbsoluteFill style={{ opacity: frame > offStart + 5 ? 0 : 1 }}>
          <Img src={staticFile('isi0.jpg')} style={{ width: 1920, height: 1080, objectFit: 'cover', objectPosition: '52% 30%', transform: `translateX(250px) scale(${kb})`, filter: 'brightness(0.6)' }} />
          <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(23,11,20,0.94) 0%, rgba(23,11,20,0.85) 36%, transparent 52%)` }} />
          <Crt />
          <Hud level="00" />
          <div style={{ position: 'absolute', left: 110, top: 170 }}>
            <Pop at={6} dur={5} from={0.7} style={{ transformOrigin: 'left center' }}>
              <div style={{ fontFamily: F.display, fontSize: 170, lineHeight: 0.84, color: C.paper, textTransform: 'uppercase', textShadow: extrude(10) }}>¡Feliz<br />cumpleaños,</div>
            </Pop>
            <Pop at={b(1.5)} dur={5} from={0.7} style={{ transformOrigin: 'left center' }}>
              <div style={{ fontFamily: F.display, fontSize: 230, lineHeight: 0.84, color: C.gold, textTransform: 'uppercase', textShadow: extrude(10, 'gold'), marginTop: 14 }}>mi vida!</div>
            </Pop>
            {frame >= b(4) && (
              <div style={{ ...dialogFrame(4), marginTop: 56, padding: '22px 30px', width: 700, transform: `scaleY(${stepped(frame, b(4), 6, 4)})`, transformOrigin: 'top' }}>
                <div style={{ fontFamily: F.body, fontSize: 38, color: C.paper, lineHeight: 1.4 }}>
                  {'Un juego hecho solo para ti.'.slice(0, Math.max(0, Math.floor((frame - b(4) - 4) / 1.2)))}
                </div>
              </div>
            )}
            {frame >= startAt && (
              <div style={{ marginTop: 44, display: 'flex', alignItems: 'center', gap: 36 }}>
                <Pop at={startAt} dur={4}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 18, background: C.gold, color: C.ink, padding: '8px 40px 14px 28px', clipPath: notch(4), borderBottom: `8px solid ${C.goldDeep}` }}>
                    <PixelIcon name="arrow" size={6} color={C.pinkDeep} style={{ transform: `translateX(${blink(frame, 16) ? 0 : 4}px)` }} />
                    <span style={{ fontFamily: F.display, fontSize: 72, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Pulsa start</span>
                  </div>
                </Pop>
                <span style={{ fontFamily: F.label, fontSize: 18, color: C.paperDim, textTransform: 'uppercase', opacity: blink(frame, 30) ? 1 : 0.35 }}>Jugadora 1</span>
              </div>
            )}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

export function Trailer() {
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Audio src={staticFile('audio.wav')} />
      <Scene name="coldOpen"><ColdOpen /></Scene>
      <Scene name="intro"><IntroScene /></Scene>
      <Scene name="levelsCard"><LevelsCard /></Scene>
      <Scene name="select"><SelectScene /></Scene>
      <Scene name="sopa">
        <LevelScene scene="sopa" speed={0.95} number={1} name="Suegros" detail="Sopa de letras" focus={{ s: 1.5, x: 1150, y: 560 }} />
      </Scene>
      <Scene name="blocks">
        <LevelScene scene="blocks" speed={1.25} number={2} name="Cuñados" detail="Block Blast · 300 puntos" focus={{ s: 1.42, x: 1180, y: 560 }} />
      </Scene>
      <Scene name="screws">
        <LevelScene scene="screws" speed={1.75} from={200} number={3} name="Novio" detail="Casa 3D · 45 tornillos" focus={{ s: 1.45, x: 1160, y: 590 }} />
      </Scene>
      <Scene name="phones"><PhonesScene /></Scene>
      <Scene name="win"><WinScene /></Scene>
      <Scene name="end"><EndCard /></Scene>
      {WIPES.filter((w) => w >= 8).map((w) => (
        <PixelWipe key={w} center={b(w)} half={Math.round(BEAT / 2)} />
      ))}
    </AbsoluteFill>
  )
}
