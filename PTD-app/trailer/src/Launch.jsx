// Vídeo de lanzamiento de PTD: ocho escenas sobre la música (src/timeline.js).
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { EV, SCENES, b } from './timeline.js'
import {
  Avatar,
  BlueButton,
  BottomNav,
  C,
  CheckRow,
  DetailHeader,
  F,
  Fab,
  Field,
  GastoCard,
  GroupCard,
  Headline,
  Icon,
  LightGround,
  NightGround,
  Phone,
  RING_IN_LOGO,
  Ring,
  SaldoCard,
  SaldoPersonal,
  SCREEN_H,
  SCREEN_W,
  TOP,
  Tap,
  Toast,
  TopBar,
  Words,
  Wordmark,
  accel,
  eur,
  inOut,
  keys,
  mix,
  out,
  pop,
  prog,
  typed,
} from './ui.jsx'

const OV = 18 // fotogramas de fundido cruzado entre escenas

export function Launch() {
  const scene = (name, Component, { overlap = true } = {}) => {
    const [s, e] = SCENES[name]
    const lead = overlap && s > 0 ? OV : 0
    const from = b(s) - lead
    return (
      <Sequence key={name} from={from} durationInFrames={b(e) - from + OV} name={name}>
        <CrossIn lead={lead}>
          <Component />
        </CrossIn>
      </Sequence>
    )
  }
  return (
    <AbsoluteFill style={{ background: C.navy }}>
      {scene('open', Open)}
      {scene('logo', LogoReveal, { overlap: false })}
      {scene('groups', Groups)}
      {scene('gasto', Gasto)}
      {scene('saldos', Saldos)}
      {scene('wallet', Wallet)}
      {scene('settle', Settle)}
      {scene('end', End)}
      <Audio src={staticFile('audio.wav')} />
    </AbsoluteFill>
  )
}

/** Fundido de entrada; desplaza el reloj para que el fotograma 0 sea el pulso de inicio de la escena. */
function CrossIn({ lead, children }) {
  const frame = useCurrentFrame()
  const o = lead ? prog(frame, 0, lead, inOut) : 1
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Sequence from={lead} layout="none">
        {children}
      </Sequence>
    </AbsoluteFill>
  )
}

/** Reloj local de una escena: convierte pulsos absolutos en fotogramas de la escena. */
const clock = (name) => (abs) => b(abs - SCENES[name][0])

// Personas del grupo "Viaje a Lisboa".
const PEOPLE = { Javi: C.blue, Lucía: '#FF7A59', Marcos: '#20B2A6', Sara: '#8B6CF6' }
// Gastos: Cena 184,60 (Javi) · Gasolina 62,40 (Lucía) · Museo 48,00 (Marcos), a partes iguales entre 4.
const SALDOS = { Javi: 110.85, Lucía: -11.35, Marcos: -25.75, Sara: -73.75 }
const CODE = 'x7Kq2Lm9PdR4'
const SCROLL = 130 // desplazamiento del formulario de gasto

/** Teléfono colocado en el lienzo, con entrada "rise" y una leve flotación ambiente. */
function PhoneAt({ cx, cy = 540, width = 400, enter = 0, tilt = 0, zoom = 1, children, screenBg }) {
  const f = useCurrentFrame()
  const p = prog(f, enter, b(1.5))
  const s = width / SCREEN_W
  const W = width + 22 * s
  const H = SCREEN_H * s + 22 * s
  const float = Math.sin(f / 80) * 5
  return (
    <div style={{ position: 'absolute', left: cx - W / 2, top: cy - H / 2, perspective: 2400 }}>
      <div
        style={{
          transform: `translateY(${(1 - p) * 380 + float}px) rotateX(${(1 - p) * 22}deg) rotateY(${tilt + Math.sin(f / 110) * 1.2}deg) scale(${zoom * mix(0.9, 1, p)})`,
          opacity: Math.min(1, p * 2.5),
        }}
      >
        <Phone width={width} screenBg={screenBg}>
          {children}
        </Phone>
      </div>
    </div>
  )
}

/** Aparición genérica: sube y se enfoca. */
const rise = (f, at, dur = 24, dist = 26) => {
  const p = prog(f, at, dur)
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` }
}

// ═══════════ 1. Apertura: el caos del chat de grupo ═══════════
const BUBBLES = [
  { who: 'Lucía', text: '¿Cuánto te debo de la cena?', x: 250, y: 210, rot: -3 },
  { who: 'Marcos', text: 'Yo puse la gasolina…', x: 1210, y: 300, rot: 2.5 },
  { who: 'Sara', text: '¿Alguien apuntó lo del museo?', x: 330, y: 730, rot: 2 },
  { who: 'Lucía', text: 'Entonces… ¿cuánto era?', x: 1150, y: 770, rot: -2 },
]
const FLOATERS = [
  ['184,60 €', 180, 480, 54],
  ['62,40 €', 1500, 170, 44],
  ['÷ 4', 1600, 560, 70],
  ['48,00 €', 760, 120, 40],
  ['¿73,75?', 860, 930, 46],
  ['+12,30', 120, 950, 38],
  ['−46,15', 1620, 950, 42],
  ['?', 1020, 230, 80],
]

function Open() {
  const f = useCurrentFrame()
  const L = clock('open')
  const dim = prog(f, L(5.2), b(1), inOut)
  const gather = prog(f, L(EV.collapse), b(1.3), accel)
  const toCenter = (x, y) => `translate(${(960 - x) * gather}px, ${(540 - y) * gather}px) scale(${1 - gather * 0.9})`
  const dot = prog(f, L(11), b(0.8), pop)
  return (
    <AbsoluteFill>
      <NightGround glow={0.1 + 0.15 * gather} />
      {FLOATERS.map(([t, x, y, size], i) => {
        const p = prog(f, L(0.8 + i * 0.45), 40)
        const drift = Math.sin((f + i * 40) / 70) * 10
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, fontFamily: F.num, fontSize: size, color: C.sky, opacity: p * 0.22 * (1 - gather), transform: `${toCenter(x, y)} translateY(${drift}px)`, filter: 'blur(0.5px)' }}>
            {t}
          </div>
        )
      })}
      {BUBBLES.map((bb, i) => {
        const p = prog(f, L(EV.bubbles[i]), 20, pop)
        const bob = Math.sin((f + i * 30) / 50) * 4
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: bb.x,
              top: bb.y,
              opacity: Math.min(1, p * 2) * mix(1, 0.22, dim) * (1 - gather),
              filter: `blur(${dim * 3}px)`,
              transform: `${toCenter(bb.x + 200, bb.y + 50)} translateY(${(1 - p) * 30 + bob}px) rotate(${bb.rot}deg) scale(${mix(0.6, 1, p)})`,
              transformOrigin: '0% 100%',
              display: 'flex',
              alignItems: 'flex-end',
              gap: 16,
            }}
          >
            <Avatar name={bb.who} size={58} color={PEOPLE[bb.who]} />
            <div style={{ background: '#fff', borderRadius: '28px 28px 28px 8px', padding: '18px 28px 20px', boxShadow: '0 20px 50px -15px rgba(0,0,0,.5)' }}>
              <div style={{ fontFamily: F.head, fontWeight: 700, fontSize: 22, color: PEOPLE[bb.who], marginBottom: 2 }}>{bb.who}</div>
              <div style={{ fontFamily: F.head, fontSize: 38, color: C.ink, whiteSpace: 'nowrap' }}>{bb.text}</div>
            </div>
          </div>
        )
      })}
      <AbsoluteFill style={{ display: 'grid', placeItems: 'center' }}>
        <Headline a="Dividir gastos" b="no debería ser un lío." at={L(5.5)} exitAt={L(9.4)} align="center" size={112} dark />
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 960 - 14,
          top: 540 - 14,
          width: 28,
          height: 28,
          borderRadius: 99,
          background: C.blue,
          boxShadow: `0 0 ${40 * dot}px ${12 * dot}px rgba(56,182,255,.55)`,
          transform: `scale(${dot})`,
        }}
      />
    </AbsoluteFill>
  )
}

// ═══════════ 2. Logo: ocho personas forman el aro ═══════════
function LogoReveal() {
  const f = useCurrentFrame()
  const L = clock('logo')
  const people = EV.wedges.map((w) => prog(f, L(w), 24, pop))
  const spin = mix(-70, 0, prog(f, L(12.2), b(3.2), out))
  const shock = prog(f, L(12.3), b(1.6), out)
  // Del aro grande y centrado a su sitio dentro del logotipo.
  const move = prog(f, L(15.25), b(1.5), inOut)
  const LW = 900
  const LH = LW * (429 / 1299)
  const lockLeft = 960 - LW / 2
  const lockTop = 500 - LH / 2
  const ringD = RING_IN_LOGO.d * LW
  const end = { x: lockLeft + RING_IN_LOGO.cx * LW, y: lockTop + RING_IN_LOGO.cy * LH, d: ringD }
  const cx = mix(960, end.x, move)
  const cy = mix(520, end.y, move)
  const d = mix(400, end.d, move)
  const size = d * (328 / 323)
  const word = prog(f, L(15.9), b(1.6), out)
  const dotGone = prog(f, L(12.4), 14)
  return (
    <AbsoluteFill>
      <NightGround glow={0.12 + 0.2 * prog(f, L(12.5), b(2))} />
      <div
        style={{
          position: 'absolute',
          left: 960 - 260,
          top: 520 - 260,
          width: 520,
          height: 520,
          borderRadius: 999,
          border: '2px solid rgba(56,182,255,.6)',
          opacity: (1 - shock) * 0.8,
          transform: `scale(${mix(0.1, 1.9, shock)})`,
        }}
      />
      <div style={{ position: 'absolute', left: 960 - 14, top: 540 - 14, width: 28, height: 28, borderRadius: 99, background: C.blue, opacity: 1 - dotGone, transform: `translate(0, ${-20 * dotGone}px) scale(${1 - dotGone * 0.6})` }} />
      <div style={{ position: 'absolute', left: cx - size / 2, top: cy - size / 2 }}>
        <Ring size={size} people={people} rotate={spin} />
      </div>
      <Wordmark width={LW} color={C.white} reveal={word} style={{ position: 'absolute', left: lockLeft, top: lockTop, transform: `translateX(${(1 - word) * -24}px)`, filter: `blur(${(1 - word) * 6}px)` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 720 }}>
        <Words text="Cuentas claras entre amigos." at={L(17.1)} style={{ justifyContent: 'center', fontFamily: F.head, fontSize: 52, color: 'rgba(255,255,255,.82)', letterSpacing: '-0.01em' }} />
      </div>
    </AbsoluteFill>
  )
}

// ═══════════ 3. Grupos: inicio → detalle → código ═══════════
const GROUPS = [
  ['image', 'Viaje a Lisboa'],
  ['restaurant', 'Cena de cumple'],
  ['euro_symbol', 'Piso compartido'],
  ['shopping_car', 'Compra semanal'],
]
function Groups() {
  const f = useCurrentFrame()
  const L = clock('groups')
  const tapAt = L(EV.tapGroup)
  const press = keys(f, [tapAt, tapAt + 5, tapAt + 14], [1, 0.97, 1])
  const push = prog(f, tapAt + 10, 28, inOut)
  const chip = prog(f, L(29.1), 22, pop)
  return (
    <AbsoluteFill>
      <LightGround />
      <div style={{ position: 'absolute', left: 190, top: 0, bottom: 0, width: 760, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <Headline a="Un grupo" b="para cada plan." sub="Viajes, pisos compartidos, cenas de cumple…" at={L(20.7)} exitAt={L(27.6)} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
            <Headline a="Invita con" b="un código." sub="Tus amigos se unen al instante." at={L(28.1)} />
            <div
              style={{
                marginTop: 44,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 18,
                padding: '18px 26px',
                borderRadius: 18,
                background: '#fff',
                boxShadow: '0 20px 50px -20px rgba(10,60,100,.35)',
                opacity: Math.min(1, chip * 1.5),
                transform: `translateY(${(1 - chip) * 30}px) scale(${mix(0.8, 1, chip)})`,
                transformOrigin: '0 50%',
              }}
            >
              <span style={{ fontFamily: F.sans, fontSize: 22, color: C.ink2 }}>Código del grupo</span>
              <span style={{ fontFamily: F.num, fontSize: 34, color: C.ink, letterSpacing: '0.04em' }}>{CODE}</span>
              <Icon name="content_copy" size={32} color={C.blue} />
            </div>
          </div>
        </div>
      </div>
      <PhoneAt cx={1300} enter={0} tilt={-8}>
        {/* Inicio */}
        <div style={{ position: 'absolute', inset: 0, background: C.lightGray, transform: `translateX(${-30 * push}%)`, filter: `brightness(${1 - push * 0.15})` }}>
          <div style={{ position: 'absolute', top: TOP + 64, left: 0, right: 0, padding: '20px 25px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {GROUPS.map(([icon, name], i) => (
              <div key={name} style={{ ...rise(f, L(20.9 + i * 0.3), 22, 30), transform: `${rise(f, L(20.9 + i * 0.3), 22, 30).transform} scale(${i === 0 ? press : 1})` }}>
                <GroupCard icon={icon} name={name} />
              </div>
            ))}
          </div>
          <TopBar icon="home" title="Inicio" />
          <Fab label="Crear PTD" right={20} bottom={98} />
          <BottomNav selected="home" />
          <Tap x={206} y={TOP + 64 + 20 + 41} at={tapAt} />
        </div>
        {/* Detalle del grupo */}
        <div style={{ position: 'absolute', inset: 0, background: '#fff', transform: `translateX(${(1 - push) * 100}%)`, boxShadow: '-20px 0 40px rgba(0,0,0,.12)' }}>
          <DetailHeader name="Viaje a Lisboa" icon="image" code={CODE} />
          <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['09 Oct. 2026', 'Entradas museo', '48,00', 'image'],
              ['08 Oct. 2026', 'Gasolina', '62,40', 'credit_card'],
            ].map(([fe, n, p, ic], i) => (
              <GastoCard key={n} fecha={fe} nombre={n} precio={p} icon={ic} style={rise(f, tapAt + 26 + i * 6, 22)} />
            ))}
          </div>
          <Fab label="Crear gasto" size={13} />
          <Tap x={330} y={TOP + 14 + 27 + 140 + 44 + 26} at={L(EV.tapCopy)} />
          <Toast text="Código copiado" at={L(EV.tapCopy) + 8} dur={60} bottom={130} />
        </div>
      </PhoneAt>
    </AbsoluteFill>
  )
}

// ═══════════ 4. Añadir gasto ═══════════
function Gasto() {
  const f = useCurrentFrame()
  const L = clock('gasto')
  const [t0, t1] = EV.typeTitle
  const [d0, d1] = EV.typeDesc
  const [p0, p1] = EV.typePrice
  const title = typed(f, 'Cena en Alfama', L(t0), L(t1) - L(t0))
  const desc = typed(f, 'Sardinas y vinho verde', L(d0), L(d1) - L(d0))
  const price = typed(f, '184,60', L(p0), L(p1) - L(p0))
  const focus = f < L(32.6) ? null : f < L(35.5) ? 'title' : f < L(37.5) ? 'desc' : f < L(39) ? 'price' : null
  const scroll = prog(f, L(38.95), 22, inOut) * SCROLL
  const checks = EV.checks.map((c) => prog(f, L(c), 14, pop))
  const btn = keys(f, [L(EV.tapCreate), L(EV.tapCreate) + 5, L(EV.tapCreate) + 16], [1, 0.95, 1])
  const iconSwap = f >= L(EV.tapIcon) + 4
  const calc = (k) => prog(f, L(EV.calc) + k * 7, 26)
  const calcOut = (k) => calc(k) // alias legible abajo
  return (
    <AbsoluteFill>
      <LightGround drift={4} />
      <PhoneAt cx={640} enter={0} tilt={8}>
        <div style={{ position: 'absolute', inset: 0, background: '#fff' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: TOP + 20, padding: '0 36px', transform: `translateY(${-scroll}px)` }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Icon name="arrow_back_ios" size={24} color={C.blue} />
              <span style={{ fontFamily: F.sans, fontSize: 20, color: C.blue, marginLeft: 4 }}>Cancelar</span>
            </div>
            <div style={{ textAlign: 'center', fontFamily: F.head, fontSize: 28, color: '#000', marginTop: 34 }}>Añadir Gasto</div>
            <div style={{ marginTop: 24 }}>
              <Field label="Título" placeholder="Añadir título aquí" value={title} focused={focus === 'title'} icon={iconSwap ? 'restaurant' : 'image'} />
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Descripción" placeholder="Añadir descripción aquí" value={desc} focused={focus === 'desc'} />
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Precio" placeholder="0,00" value={price ? `${price} €` : ''} focused={focus === 'price'} width="55%" />
            </div>
            <div style={{ fontFamily: F.head, fontSize: 25, color: '#000', marginTop: 22 }}>A dividir entre</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {Object.keys(PEOPLE).map((n, i) => (
                <CheckRow key={n} name={n} p={checks[i]} />
              ))}
            </div>
            <div style={{ fontFamily: F.head, fontSize: 25, color: '#000', marginTop: 30 }}>Pagado por</div>
            <div style={{ marginTop: 8, height: 52, borderRadius: 10, background: C.sky, display: 'flex', alignItems: 'center', padding: '0 16px', fontFamily: F.sans, fontSize: 15 }}>
              Javi
              <svg width="14" height="10" viewBox="0 0 14 10" style={{ marginLeft: 'auto' }}>
                <path d="M0 0h14L7 10Z" fill="#000" />
              </svg>
            </div>
            <BlueButton text="Crear gasto" press={btn} style={{ marginTop: 40 }} />
          </div>
          <Tap x={52} y={TOP + 20 + 27 + 34 + 38 + 24 + 30 + 28} at={L(EV.tapIcon)} />
          <Tap x={206} y={945 - SCROLL} at={L(EV.tapCreate)} />
          <Toast text="Gasto creado" at={L(EV.tapCreate) + 8} dur={70} />
        </div>
      </PhoneAt>
      {/* Titular, y después la cuenta que hace la app */}
      <div style={{ position: 'absolute', left: 1010, right: 120, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <Headline a="Apunta un gasto" b="en segundos." sub="Quién pagó, cuánto y entre quiénes." at={L(32.8)} exitAt={L(42.5)} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)' }}>
            <div style={{ ...rise(f, L(EV.calc), 26, 40), fontFamily: F.num, fontSize: 150, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1 }}>184,60 €</div>
            <div style={{ ...rise(f, L(EV.calc) + 10, 26, 30), display: 'flex', alignItems: 'center', gap: 20, marginTop: 26 }}>
              <span style={{ fontFamily: F.num, fontSize: 64, color: C.blue }}>÷ 4</span>
              <div style={{ display: 'flex' }}>
                {Object.keys(PEOPLE).map((n, i) => {
                  const p = prog(f, L(EV.calc) + 14 + i * 4, 18, pop)
                  return (
                    <div key={n} style={{ marginLeft: i ? -12 : 0, transform: `scale(${p})`, border: '4px solid #F4F8FB', borderRadius: 99 }}>
                      <Avatar name={n} size={66} color={PEOPLE[n]} />
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ ...rise(f, L(EV.calc) + 30, 26, 30), marginTop: 30, fontFamily: F.head, fontSize: 54, color: C.ink2 }}>
              = <span style={{ fontFamily: F.num, color: C.ink }}>{eur(46.15 * calcOut(2))} €</span> cada uno
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ═══════════ 5. Saldos: la app hace las cuentas ═══════════
function Saldos() {
  const f = useCurrentFrame()
  const L = clock('saldos')
  const tab = prog(f, L(EV.tapSaldos) + 4, 16, inOut)
  const [c0, c1] = EV.count
  const count = prog(f, L(c0), L(c1) - L(c0), out)
  const swap = prog(f, L(EV.tapSaldos) + 6, 16)
  const zoom = mix(1, 1.04, prog(f, 0, b(10), inOut))
  return (
    <AbsoluteFill>
      <LightGround drift={8} />
      <div style={{ position: 'absolute', left: 190, top: 0, bottom: 0, width: 780, display: 'flex', alignItems: 'center' }}>
        <Headline a="PTD hace" b="las cuentas por ti." sub="Sabrás al momento quién debe a quién." at={L(46.6)} />
      </div>
      <PhoneAt cx={1300} enter={0} tilt={-8} zoom={zoom}>
        <div style={{ position: 'absolute', inset: 0, background: '#fff' }}>
          <DetailHeader name="Viaje a Lisboa" icon="image" code={CODE} tab={tab} />
          <div style={{ position: 'absolute', left: 20, right: 20, top: 392, opacity: 1 - swap, transform: `translateX(${-swap * 30}px)`, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <GastoCard fecha="10 Oct. 2026" nombre="Cena en Alfama" precio="184,60" icon="restaurant" />
            <GastoCard fecha="09 Oct. 2026" nombre="Entradas museo" precio="48,00" icon="image" />
          </div>
          <div style={{ position: 'absolute', left: 40, right: 40, top: 392, opacity: swap, transform: `translateX(${(1 - swap) * 30}px)` }}>
            <SaldoPersonal value={SALDOS.Javi * count} />
            <div style={{ fontFamily: F.head, fontSize: 20, color: '#000', margin: '18px 0 8px' }}>Saldos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {['Lucía', 'Marcos', 'Sara'].map((n, i) => (
                <div key={n} style={rise(f, L(47.6 + i * 0.3), 22)}>
                  <SaldoCard nombre={n} importe={eur(SALDOS[n] * prog(f, L(47.6 + i * 0.3), 40))} />
                </div>
              ))}
            </div>
          </div>
          <div style={{ opacity: prog(f, L(48.8), 20) }}>
            <Fab icon="shopping_cart_checkout" label="Liquidar deudas" size={13} />
          </div>
          <Tap x={309} y={TOP + 14 + 27 + 140 + 44 + 8 + 24 + 32} at={L(EV.tapSaldos)} />
        </div>
      </PhoneAt>
    </AbsoluteFill>
  )
}

// ═══════════ 6. Cartera e ingreso con Google Pay ═══════════
function Wallet() {
  const f = useCurrentFrame()
  const L = clock('wallet')
  const credited = prog(f, L(EV.credited), 34, out)
  const balance = 35 + 20 * credited
  const flash = keys(f, [L(EV.credited), L(EV.credited) + 8, L(EV.credited) + 40], [0, 1, 0])
  const chipOn = f >= L(EV.tapChip) + 3
  const btn = keys(f, [L(EV.tapIngresar), L(EV.tapIngresar) + 5, L(EV.tapIngresar) + 16], [1, 0.95, 1])
  const sheet = prog(f, L(EV.sheet), 24, out) * (1 - prog(f, L(EV.tapPay) + 10, 18, accel))
  const payBtn = keys(f, [L(EV.tapPay), L(EV.tapPay) + 5, L(EV.tapPay) + 16], [1, 0.95, 1])
  const banner = prog(f, L(EV.credited) + 10, 22, out) * (1 - prog(f, L(65), 20, accel))
  const card = { background: '#fff', border: `1px solid ${C.gray}` }
  const row = { display: 'flex', alignItems: 'center', padding: '0 60px', flex: 1, fontFamily: F.head, fontSize: 20 }
  return (
    <AbsoluteFill>
      <LightGround drift={12} />
      <PhoneAt cx={640} enter={0} tilt={8}>
        <div style={{ position: 'absolute', inset: 0, background: C.lightGray }}>
          <div style={{ position: 'absolute', top: TOP + 64 + 20, left: 0, right: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ ...card, height: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 15, boxShadow: `inset 0 0 0 ${3 * flash}px ${C.green}` }}>
              <div style={{ fontFamily: F.num, fontSize: 25 * (1 + flash * 0.12), color: flash > 0.05 ? C.green : '#000', fontVariantNumeric: 'tabular-nums' }}>{eur(balance)} €</div>
              <div style={{ fontFamily: F.head, fontWeight: 700, fontSize: 20, color: C.blue }}>Saldo disponible</div>
            </div>
            <div style={{ ...card, height: 180, display: 'flex', flexDirection: 'column' }}>
              <div style={row}>
                Debes<span style={{ marginLeft: 'auto', color: 'red', fontFamily: F.num }}>- 0,00 €</span>
              </div>
              <div style={{ height: 1, background: C.gray }} />
              <div style={row}>
                Te deben<span style={{ marginLeft: 'auto', color: C.green, fontFamily: F.num }}>+ 110,85 €</span>
              </div>
              <div style={{ height: 1, background: C.gray }} />
              <div style={row}>
                Saldo real<span style={{ marginLeft: 'auto', fontFamily: F.num }}>{eur(balance + 110.85)} €</span>
              </div>
            </div>
            <div style={{ ...card, height: 300, padding: 20, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontFamily: F.head, fontWeight: 700, fontSize: 20 }}>Ingresar dinero</div>
              <div style={{ display: 'flex', gap: 12 }}>
                {['10', '20', '50'].map((a) => (
                  <div key={a} style={{ height: 40, padding: '0 24px', borderRadius: 99, display: 'grid', placeItems: 'center', fontFamily: F.num, fontSize: 18, color: C.blue, background: chipOn && a === '20' ? 'rgba(56,182,255,.14)' : 'transparent' }}>
                    {a} €
                  </div>
                ))}
              </div>
              <Field placeholder="0,00" value={chipOn ? '20' : ''} width="40%" />
              <BlueButton text="Ingresar" press={btn} />
            </div>
          </div>
          <TopBar icon="wallet" title="Cartera" />
          <BottomNav selected="wallet" unread={banner > 0.5 || f > L(65)} />
          <Tap x={145} y={TOP + 64 + 20 + 150 + 24 + 180 + 24 + 20 + 27 + 16 + 20} at={L(EV.tapChip)} />
          <Tap x={206} y={TOP + 64 + 20 + 150 + 24 + 180 + 24 + 20 + 27 + 16 + 40 + 16 + 56 + 16 + 25} at={L(EV.tapIngresar)} />
          {/* Hoja de pago */}
          <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${0.4 * sheet})` }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 360, background: '#fff', borderRadius: '26px 26px 0 0', transform: `translateY(${(1 - sheet) * 100}%)`, padding: '14px 28px', boxSizing: 'border-box', fontFamily: F.sans }}>
            <div style={{ width: 36, height: 4, borderRadius: 4, background: '#c8cbd0', margin: '0 auto 22px' }} />
            <div style={{ fontWeight: 700, fontSize: 21, color: '#202124' }}>Pagar con Google Pay</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22, fontSize: 17, color: '#3c4043' }}>
              <span>PTD App</span>
              <span style={{ fontWeight: 700 }}>20,00 €</span>
            </div>
            <div style={{ height: 1, background: '#e3e5e8', margin: '18px 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 16, color: '#3c4043' }}>
              <Icon name="credit_card" size={30} color="#5f6368" />
              Visa •••• 4242
            </div>
            <div style={{ marginTop: 40, height: 52, borderRadius: 99, background: '#202124', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 17, transform: `scale(${payBtn})` }}>Continuar</div>
          </div>
          <Tap x={206} y={SCREEN_H - 360 + 14 + 26 + 29 + 22 + 23 + 37 + 30 + 40 + 26} at={L(EV.tapPay)} />
          {/* Aviso del ingreso */}
          <div style={{ position: 'absolute', left: 12, right: 12, top: 48, borderRadius: 22, background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,.18)', padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', transform: `translateY(${(1 - banner) * -140}px)`, opacity: banner }}>
            <div style={{ width: 40, height: 40, borderRadius: 99, background: '#eaf6ff', display: 'grid', placeItems: 'center' }}>
              <Ring size={30} />
            </div>
            <div style={{ fontFamily: F.head }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Ingreso exitoso</div>
              <div style={{ fontSize: 14, color: '#444' }}>Se han ingresado 20,00 € a tu cuenta.</div>
            </div>
          </div>
        </div>
      </PhoneAt>
      <div style={{ position: 'absolute', left: 1010, right: 120, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
        <Headline a="Tu cartera," b="dentro de la app." sub="Recarga saldo con Google Pay en un toque." at={L(56.6)} />
      </div>
    </AbsoluteFill>
  )
}

// ═══════════ 7. Liquidar: un toque y todos en paz ═══════════
function Settle() {
  const f = useCurrentFrame()
  const L = clock('settle')
  const fab = keys(f, [L(EV.tapSettle), L(EV.tapSettle) + 5, L(EV.tapSettle) + 16], [1, 0.9, 1])
  const dialog = prog(f, L(EV.tapSettle) + 8, 18, out) * (1 - prog(f, L(EV.tapConfirm) + 6, 12, accel))
  const [z0, z1] = EV.zero
  const zero = prog(f, L(z0), L(z1) - L(z0), inOut)
  const k = 1 - zero
  // Punto que viaja del teléfono a cada persona justo antes de su aviso.
  const rows = ['Lucía', 'Marcos', 'Sara']
  const rowY = (i) => 500 + i * 150
  return (
    <AbsoluteFill>
      <LightGround drift={16} />
      <PhoneAt cx={560} enter={0} tilt={8}>
        <div style={{ position: 'absolute', inset: 0, background: '#fff' }}>
          <DetailHeader name="Viaje a Lisboa" icon="image" code={CODE} tab={1} />
          <div style={{ position: 'absolute', left: 40, right: 40, top: 392 }}>
            <SaldoPersonal value={SALDOS.Javi * k} />
            <div style={{ fontFamily: F.head, fontSize: 20, color: '#000', margin: '18px 0 8px' }}>Saldos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rows.map((n) => (
                <SaldoCard key={n} nombre={n} importe={eur(SALDOS[n] * k)} />
              ))}
            </div>
          </div>
          <Fab icon="shopping_cart_checkout" label="Liquidar deudas" size={13} press={fab} />
          <Tap x={SCREEN_W - 20 - 46} y={SCREEN_H - 20 - 50} at={L(EV.tapSettle)} />
          {/* Diálogo de confirmación */}
          <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${0.32 * dialog})` }} />
          <div
            style={{
              position: 'absolute',
              left: 34,
              right: 34,
              top: 290,
              borderRadius: 28,
              background: '#f3f2f7',
              padding: '24px 24px 14px',
              opacity: dialog,
              transform: `scale(${mix(0.9, 1, dialog)})`,
              fontFamily: F.head,
            }}
          >
            <div style={{ fontSize: 25, color: 'red' }}>Alerta!</div>
            <div style={{ fontSize: 18, color: '#1d1b20', textAlign: 'justify', marginTop: 14, lineHeight: 1.35 }}>Si saldas las deudas de este grupo ya no se podrán editar posteriormente y se archivará.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 26, marginTop: 20, fontSize: 18, color: C.blue, paddingRight: 8 }}>
              <span>Cancelar</span>
              <span>Confirmar</span>
            </div>
          </div>
          <Tap x={SCREEN_W - 34 - 24 - 8 - 40} y={290 + 24 + 34 + 14 + 98 + 20 + 12} at={L(EV.tapConfirm)} />
          <Toast text="Deudas liquidadas correctamente" at={L(EV.tapConfirm) + 18} dur={80} />
        </div>
      </PhoneAt>
      <div style={{ position: 'absolute', left: 900, right: 100, top: 170 }}>
        <Headline a="Un toque." b="Deudas saldadas." at={L(66.6)} size={96} />
      </div>
      {rows.map((n, i) => {
        const at = L(EV.notes[i])
        const fly = prog(f, at - b(0.6), b(0.6), inOut)
        const p = prog(f, at, 22, pop)
        const sx = 790
        const sy = 560
        const ex = 940
        const ey = rowY(i) + 44
        const x = mix(sx, ex, fly)
        const y = mix(sy, ey, fly) - Math.sin(Math.PI * fly) * 90
        return (
          <div key={n}>
            {fly > 0 && fly < 1 && <div style={{ position: 'absolute', left: x - 9, top: y - 9, width: 18, height: 18, borderRadius: 99, background: C.blue, boxShadow: '0 0 20px rgba(56,182,255,.8)' }} />}
            <div style={{ position: 'absolute', left: 900, top: rowY(i), display: 'flex', alignItems: 'center', gap: 22, opacity: Math.min(1, p * 2), transform: `translateX(${(1 - p) * -40}px) scale(${mix(0.85, 1, p)})`, transformOrigin: '0 50%' }}>
              <Avatar name={n} size={88} color={PEOPLE[n]} />
              <div style={{ width: 820, borderRadius: 22, background: '#fff', boxShadow: '0 20px 50px -22px rgba(10,60,100,.4)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 18 }}>
                <Icon name="notifications" size={34} color={C.blue} />
                <div style={{ fontFamily: F.head, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 26, color: C.ink }}>Grupo liquidado</div>
                  <div style={{ fontSize: 19, color: C.ink2 }}>Javi ha saldado todas las deudas en el grupo “Viaje a Lisboa”.</div>
                </div>
                <div style={{ fontFamily: F.num, fontSize: 24, color: C.ink2, whiteSpace: 'nowrap' }}>{eur(SALDOS[n])} €</div>
              </div>
            </div>
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

// ═══════════ 8. Cierre ═══════════
function End() {
  const f = useCurrentFrame()
  const L = clock('end')
  const people = Array.from({ length: 8 }, (_, k) => prog(f, L(80.2) + k * 4, 22, pop))
  const spin = mix(-50, 0, prog(f, L(80), b(2.5), out))
  const word = prog(f, L(81.2), b(1.5), out)
  const LW = 820
  const LH = LW * (429 / 1299)
  const lockLeft = 960 - LW / 2
  const lockTop = 430 - LH / 2
  const d = RING_IN_LOGO.d * LW
  const size = d * (328 / 323)
  const cx = lockLeft + RING_IN_LOGO.cx * LW
  const cy = lockTop + RING_IN_LOGO.cy * LH
  const pill = prog(f, L(86), 26, pop)
  const fadeOut = prog(f, L(90.6), b(1.4), inOut)
  return (
    <AbsoluteFill>
      <NightGround glow={0.22} />
      <AbsoluteFill style={{ opacity: 1 - fadeOut }}>
        <div style={{ position: 'absolute', left: cx - size / 2, top: cy - size / 2 }}>
          <Ring size={size} people={people} rotate={spin} />
        </div>
        <Wordmark width={LW} color={C.white} reveal={word} style={{ position: 'absolute', left: lockLeft, top: lockTop, transform: `translateX(${(1 - word) * -24}px)`, filter: `blur(${(1 - word) * 6}px)` }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 640 }}>
          <Headline a="Cuentas claras," b="amistades largas." at={L(82.6)} align="center" size={72} dark style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: 20 }} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 760 }}>
          <Words
            text="Grupos · Gastos · Saldos · Cartera · Avisos"
            at={L(84.4)}
            stagger={3}
            style={{ justifyContent: 'center', fontFamily: F.head, fontSize: 30, color: 'rgba(255,255,255,.55)', letterSpacing: '0.02em' }}
          />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 850, display: 'flex', justifyContent: 'center' }}>
          <div style={{ padding: '14px 30px', borderRadius: 99, border: `2px solid ${C.blue}`, color: C.white, fontFamily: F.head, fontWeight: 700, fontSize: 28, opacity: Math.min(1, pill * 1.5), transform: `scale(${mix(0.8, 1, pill)})`, background: 'rgba(56,182,255,.12)' }}>
            App para Android
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
