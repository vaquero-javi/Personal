// Piezas del vídeo con el lenguaje de PTD: azul #38B6FF, tarjetas celeste #A7D8F5,
// Open Sans SemiCondensed. Movimiento "corporativo amable": salidas suaves y un pelín de rebote en los toques.
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import icons from './icons.json'

export const C = {
  navy: '#061321',
  navy2: '#0d2236',
  blue: '#38B6FF', // BlueLight
  sky: '#A7D8F5', // LightBlue / CardColor
  skyDark: '#89C2E2',
  green: '#00BF63',
  gray: '#5F6368',
  lightGray: '#EFEFEF',
  red: '#D32F2F',
  ink: '#0E1B26',
  ink2: '#4A5866',
  paper: '#F4F8FB',
  white: '#FFFFFF',
}
export const F = {
  head: "'OSSC', 'Open Sans', sans-serif", // Open Sans SemiCondensed
  sans: "'OpenSans', sans-serif",
  num: "'OpenSauce', 'OpenSans', sans-serif",
  dongle: "'Dongle', sans-serif",
}

// Curva firma: arranca rápido y aterriza suave. Rebote ligero sólo para toques y "pops".
export const out = Easing.bezier(0.22, 1, 0.36, 1)
export const inOut = Easing.bezier(0.65, 0, 0.35, 1)
export const accel = Easing.bezier(0.55, 0, 1, 0.45)
export const pop = Easing.bezier(0.175, 0.885, 0.32, 1.275)

export const prog = (frame, from, dur, ease = out) =>
  interpolate(frame, [from, from + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })
export const mix = (a, z, p) => a + (z - a) * p
export function keys(frame, frames, values, ease = inOut) {
  return interpolate(frame, frames, values, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })
}
/** Importe con coma decimal, como String.format("%.2f") en español. */
export const eur = (v) => `${v < 0 ? '-' : ''}${Math.abs(v).toFixed(2).replace('.', ',')}`
/** Texto que se va escribiendo entre `from` y `from + dur`. */
export const typed = (frame, text, from, dur) => text.slice(0, Math.round(text.length * prog(frame, from, dur, (x) => x)))

// ——— Texto ———
export function Words({ text, at, stagger = 4, dur = 30, exitAt, exitDur = 20, style, wordStyle }) {
  const frame = useCurrentFrame()
  const words = text.split(' ')
  const gone = exitAt === undefined ? 0 : prog(frame, exitAt, exitDur, accel)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: '0.24em', ...style }}>
      {words.map((w, i) => {
        const p = prog(frame, at + i * stagger, dur)
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: p * (1 - gone),
              transform: `translateY(${(1 - p) * 0.5 - gone * 0.3}em)`,
              filter: `blur(${(1 - p) * 12 + gone * 8}px)`,
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

/** Titular en dos líneas: tinta + azul de la marca. */
export function Headline({ a, b, sub, at, exitAt, align = 'left', size = 92, dark = false, style }) {
  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
  const base = { fontFamily: F.head, fontWeight: 700, fontSize: size, letterSpacing: '-0.025em', justifyContent: justify }
  return (
    <div style={{ lineHeight: 1.04, textAlign: align, ...style }}>
      <Words text={a} at={at} exitAt={exitAt} style={{ ...base, color: dark ? C.white : C.ink }} />
      {b && <Words text={b} at={at + 8} exitAt={exitAt} style={{ ...base, color: C.blue }} />}
      {sub && (
        <Words
          text={sub}
          at={at + 20}
          stagger={2}
          exitAt={exitAt}
          style={{ fontFamily: F.sans, fontSize: size * 0.33, color: dark ? 'rgba(255,255,255,.7)' : C.ink2, marginTop: size * 0.32, justifyContent: justify, letterSpacing: '-0.005em' }}
        />
      )}
    </div>
  )
}

// ——— Iconos Material de la app (res/drawable) ———
export function Icon({ name, size = 24, color = C.gray, style }) {
  const ic = icons[name]
  return (
    <svg viewBox={ic.vb} width={size} height={size} style={{ display: 'block', flexShrink: 0, ...style }}>
      {ic.paths.map((d, i) => (
        <path key={i} d={d} fill={color} />
      ))}
    </svg>
  )
}

// ——— Marca ———
const LOGO_W = 1299
const LOGO_H = 429
/** Logotipo completo teñido con `color` (silueta del PNG de la app). */
export function Wordmark({ width, color = C.blue, reveal = 1, style }) {
  const url = `url(${staticFile('logo_transparente.png')})`
  // Sólo las letras: el aro se dibuja aparte con <Ring/>.
  const left = 33
  const right = (100 - left) * (1 - reveal)
  return (
    <div
      style={{
        width,
        height: width * (LOGO_H / LOGO_W),
        background: color,
        WebkitMaskImage: url,
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        clipPath: `inset(-2% ${right}% -2% ${left}%)`,
        ...style,
      }}
    />
  )
}
/** Dónde cae el aro dentro del logotipo (en fracción del ancho/alto del PNG). */
export const RING_IN_LOGO = { cx: 174 / LOGO_W, cy: 219 / LOGO_H, d: 323 / LOGO_W }

/**
 * El aro de ocho personas. Cada persona es una cuña del PNG que entra por turnos
 * (`people[k]` de 0 a 1); cuando están todas, se pinta la imagen entera para evitar costuras.
 */
export function Ring({ size, people = Array(8).fill(1), rotate = 0, style }) {
  const all = people.every((p) => p >= 1)
  const s = size / 328
  const cx = 164 * s
  const cy = 163.5 * s
  const R = 400 * s
  const wedge = (k) => {
    const a0 = ((k * 45 - 22.5 - 90) * Math.PI) / 180
    const a1 = ((k * 45 + 22.5 - 90) * Math.PI) / 180
    return `polygon(${cx}px ${cy}px, ${cx + R * Math.cos(a0)}px ${cy + R * Math.sin(a0)}px, ${cx + R * Math.cos(a1)}px ${cy + R * Math.sin(a1)}px)`
  }
  const img = { position: 'absolute', inset: 0, width: size, height: size * (327 / 328) }
  return (
    <div style={{ position: 'relative', width: size, height: size * (327 / 328), transform: `rotate(${rotate}deg)`, ...style }}>
      {all ? (
        <Img src={staticFile('icono_solo.png')} style={img} />
      ) : (
        people.map((p, k) => (
          <div
            key={k}
            style={{
              ...img,
              clipPath: wedge(k),
              opacity: Math.min(1, p * 1.6),
              transform: `scale(${mix(0.55, 1, p)}) rotate(${(1 - p) * -25}deg)`,
              transformOrigin: `${cx}px ${cy}px`,
              filter: p < 1 ? `blur(${(1 - p) * 6}px)` : undefined,
            }}
          >
            <Img src={staticFile('icono_solo.png')} style={{ width: size, height: size * (327 / 328) }} />
          </div>
        ))
      )}
    </div>
  )
}

// ——— Fondos ———
export function NightGround({ glow = 0.25 }) {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 55% 50% at 50% 50%, rgba(56,182,255,${glow}) 0%, rgba(56,182,255,0) 70%), radial-gradient(ellipse at 50% 40%, ${C.navy2} 0%, ${C.navy} 75%)`,
      }}
    />
  )
}
/** Fondo claro con dos manchas de luz azul que derivan despacio (capa ambiente). */
export function LightGround({ drift = 0 }) {
  const frame = useCurrentFrame()
  const t = frame / 60 + drift
  const x1 = 22 + Math.sin(t * 0.35) * 6
  const y1 = 30 + Math.cos(t * 0.3) * 6
  const x2 = 78 + Math.cos(t * 0.28) * 6
  const y2 = 72 + Math.sin(t * 0.32) * 6
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${x1}% ${y1}%, rgba(56,182,255,.20) 0%, rgba(56,182,255,0) 38%), radial-gradient(circle at ${x2}% ${y2}%, rgba(167,216,245,.55) 0%, rgba(167,216,245,0) 40%), linear-gradient(180deg, #F7FAFC 0%, ${C.paper} 60%, #E9F1F7 100%)`,
      }}
    />
  )
}

// ——— Dispositivo ———
export const SCREEN_W = 412
export const SCREEN_H = 892
/** Teléfono Android: marco fino, cámara perforada y barra de estado. Pantalla de 412×892 dp. */
export function Phone({ width = 412, children, style, statusDark = true, screenBg = C.white, statusBg = C.white }) {
  const s = width / SCREEN_W
  const bezel = 11 * s
  return (
    <div
      style={{
        position: 'relative',
        padding: bezel,
        background: '#0c0f12',
        borderRadius: 58 * s,
        boxShadow: `0 0 0 ${2.5 * s}px #2b3138, 0 ${60 * s}px ${120 * s}px -${30 * s}px rgba(8,30,50,.45), 0 ${18 * s}px ${40 * s}px -${12 * s}px rgba(8,30,50,.3)`,
        ...style,
      }}
    >
      <div style={{ position: 'relative', width, height: SCREEN_H * s, overflow: 'hidden', borderRadius: 48 * s, background: screenBg }}>
        <div style={{ position: 'absolute', width: SCREEN_W, height: SCREEN_H, transform: `scale(${s})`, transformOrigin: '0 0' }}>
          {children}
          <StatusBar dark={statusDark} bg={statusBg} />
        </div>
      </div>
    </div>
  )
}
function StatusBar({ dark, bg }) {
  const c = dark ? '#1b1b1b' : '#fff'
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, background: bg, display: 'flex', alignItems: 'center', padding: '0 26px', fontFamily: F.sans, fontWeight: 700, fontSize: 15, color: c }}>
      <span>9:41</span>
      <div style={{ position: 'absolute', left: '50%', top: 12, width: 18, height: 18, marginLeft: -9, borderRadius: 99, background: '#000' }} />
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
        <svg width="17" height="13" viewBox="0 0 17 13">
          <path d="M8.5 13 0 3.5C2.3 1.3 5.3 0 8.5 0S14.7 1.3 17 3.5L8.5 13Z" fill={c} />
        </svg>
        <svg width="15" height="14" viewBox="0 0 15 14">
          <path d="M15 0v14H0L15 0Z" fill={c} />
        </svg>
        <div style={{ width: 11, height: 18, borderRadius: 2.5, border: `1.8px solid ${c}`, position: 'relative', boxSizing: 'border-box' }}>
          <div style={{ position: 'absolute', left: 1, right: 1, bottom: 1, height: '72%', background: c, borderRadius: 1 }} />
        </div>
      </div>
    </div>
  )
}

/** Indicador de toque: aparece, presiona y deja una onda. `at` en fotogramas locales. */
export function Tap({ x, y, at, color = C.blue }) {
  const f = useCurrentFrame()
  const inP = prog(f, at - 12, 12)
  const press = keys(f, [at, at + 5, at + 14], [1, 0.82, 1])
  const ring = prog(f, at, 30)
  const gone = prog(f, at + 14, 14, accel)
  if (f < at - 12 || f > at + 34) return null
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x - 30,
          top: y - 30,
          width: 60,
          height: 60,
          borderRadius: 99,
          border: `3px solid ${color}`,
          opacity: (1 - ring) * 0.7,
          transform: `scale(${mix(0.6, 2.1, ring)})`,
          visibility: f >= at ? 'visible' : 'hidden',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x - 24,
          top: y - 24,
          width: 48,
          height: 48,
          borderRadius: 99,
          background: 'rgba(255,255,255,.55)',
          border: '2px solid rgba(255,255,255,.95)',
          boxShadow: '0 6px 18px rgba(10,40,70,.28)',
          opacity: inP * (1 - gone),
          transform: `scale(${mix(1.4, 1, inP) * press})`,
        }}
      />
    </>
  )
}

/** Toast de Android, abajo y centrado. */
export function Toast({ text, at, dur = 70, bottom = 120 }) {
  const f = useCurrentFrame()
  const p = prog(f, at, 14)
  const z = prog(f, at + dur, 14, accel)
  if (p === 0 || z === 1) return null
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom, display: 'flex', justifyContent: 'center', opacity: p * (1 - z) }}>
      <div style={{ padding: '12px 20px', borderRadius: 99, background: '#2f3133', color: '#fff', fontFamily: F.sans, fontSize: 15, boxShadow: '0 6px 20px rgba(0,0,0,.25)', transform: `translateY(${(1 - p) * 10}px)` }}>
        {text}
      </div>
    </div>
  )
}

// ═══════════ Pantallas de la app (recreadas a partir del código Compose) ═══════════
export const TOP = 40 // alto de la barra de estado

export function TopBar({ icon, title }) {
  return (
    <div style={{ position: 'absolute', top: TOP, left: 0, right: 0, height: 64, background: '#fff', borderBottom: `1px solid ${C.gray}`, display: 'flex', alignItems: 'center', padding: '0 20px 0 28px' }}>
      <Icon name={icon} size={42} color={C.gray} />
      <span style={{ marginLeft: 30, fontFamily: F.sans, fontWeight: 700, fontSize: 22, color: '#000' }}>{title}</span>
      <Icon name="account_circle" size={42} color={C.blue} style={{ marginLeft: 'auto' }} />
    </div>
  )
}
export function BottomNav({ selected, unread = false }) {
  const items = ['wallet', 'home', 'notifications']
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 84, background: '#fff', borderTop: `1px solid ${C.gray}`, display: 'flex', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 6 }}>
      {items.map((it) => (
        <div key={it} style={{ position: 'relative', width: 55, height: 55, display: 'grid', placeItems: 'center' }}>
          {selected === it && <div style={{ position: 'absolute', inset: 0, borderRadius: 99, background: C.sky }} />}
          <Icon name={it} size={38} color={C.gray} style={{ position: 'relative' }} />
          {it === 'notifications' && unread && <div style={{ position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 99, background: C.red }} />}
        </div>
      ))}
    </div>
  )
}
/** Botón flotante con etiqueta (Crear PTD / Crear gasto / Liquidar deudas). */
export function Fab({ icon = 'add_circle', label, right = 20, bottom = 20, size = 11, press = 1 }) {
  return (
    <div style={{ position: 'absolute', right, bottom, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${press})` }}>
      <Icon name={icon} size={60} color={C.blue} />
      <span style={{ fontFamily: F.head, fontSize: size, color: C.blue }}>{label}</span>
    </div>
  )
}

/** CustomCardInicio */
export function GroupCard({ icon, name, style }) {
  return (
    <div style={{ borderRadius: 19, background: C.sky, padding: 20, display: 'flex', alignItems: 'center', ...style }}>
      <Icon name={icon} size={43} color={C.gray} />
      <span style={{ marginLeft: 25, fontFamily: F.head, fontSize: 21, color: '#000' }}>{name}</span>
      <Icon name="chevron_right" size={43} color={C.gray} style={{ marginLeft: 'auto' }} />
    </div>
  )
}
/** CustomCardGasto */
export function GastoCard({ fecha, nombre, precio, icon, style }) {
  return (
    <div style={style}>
      <div style={{ paddingLeft: 8, fontFamily: F.num, fontSize: 16, color: '#000', marginBottom: 2 }}>{fecha}</div>
      <div style={{ borderRadius: 19, background: C.sky, padding: '18px 20px', display: 'flex', alignItems: 'center' }}>
        <Icon name={icon} size={40} color={C.gray} />
        <span style={{ marginLeft: 20, fontFamily: F.head, fontSize: 22, color: '#000' }}>{nombre}</span>
        <span style={{ marginLeft: 'auto', fontFamily: F.num, fontSize: 19, color: '#000' }}>{precio} €</span>
      </div>
    </div>
  )
}
/** CustomCardSaldo */
export function SaldoCard({ nombre, importe, color = '#000', style }) {
  return (
    <div style={{ borderRadius: 19, background: C.sky, padding: 12, paddingLeft: 16, paddingRight: 16, display: 'flex', alignItems: 'center', ...style }}>
      <span style={{ fontFamily: F.head, fontSize: 22, color: '#000' }}>{nombre}</span>
      <span style={{ marginLeft: 'auto', fontFamily: F.num, fontSize: 20, color, fontVariantNumeric: 'tabular-nums' }}>{importe} €</span>
    </div>
  )
}
/** CustomCardSaldoPersonal */
export function SaldoPersonal({ value, style }) {
  const color = value > 0.004 ? C.green : value < -0.004 ? 'red' : '#000'
  return (
    <div style={{ borderRadius: 19, background: C.sky, padding: '20px 26px', display: 'flex', alignItems: 'center', ...style }}>
      <span style={{ fontFamily: F.head, fontSize: 30, color: '#000' }}>{value < -0.004 ? 'Debes:' : 'Te deben:'}</span>
      <span style={{ marginLeft: 'auto', fontFamily: F.num, fontSize: 25, color, fontVariantNumeric: 'tabular-nums' }}>{eur(value)} €</span>
    </div>
  )
}

/** Cabecera de DetailPTDScreen hasta el selector de pestañas. `tab` 0 = Gastos, 1 = Saldos (admite intermedios). */
export function DetailHeader({ name, icon, code, tab = 0 }) {
  return (
    <div style={{ padding: 20, paddingTop: TOP + 14 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Icon name="arrow_back_ios" size={24} color={C.blue} />
        <span style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 20, color: C.blue }}>Inicio</span>
      </div>
      <Icon name={icon} size={132} color={C.sky} style={{ margin: '8px auto 0' }} />
      <div style={{ textAlign: 'center', fontFamily: F.head, fontWeight: 700, fontSize: 28, color: '#000', marginTop: 6 }}>{name}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, marginTop: 4 }}>
        <span style={{ fontFamily: F.sans, fontSize: 14, color: 'gray' }}>Código del grupo: {code}</span>
        <Icon name="content_copy" size={22} color={C.blue} style={{ marginLeft: 18 }} />
      </div>
      <div style={{ position: 'relative', height: 48, marginTop: 8, borderRadius: 9, background: C.sky, display: 'flex' }}>
        <div style={{ position: 'absolute', top: 3, bottom: 3, left: 3, width: 'calc(50% - 6px)', borderRadius: 6, background: C.blue, transform: `translateX(calc(${tab * 100}% + ${tab * 6}px))` }} />
        {['Gastos', 'Saldos'].map((t, i) => (
          <div key={t} style={{ position: 'relative', flex: 1, display: 'grid', placeItems: 'center', fontFamily: F.head, fontSize: 15, color: Math.abs(tab - i) < 0.5 ? '#fff' : '#000' }}>
            {t}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Campo de texto relleno de la app (CustomTextField): etiqueta en Dongle y caja celeste. */
export function Field({ label, placeholder, value, focused, icon, caret = true, width = '100%' }) {
  const f = useCurrentFrame()
  const blink = Math.floor(f / 18) % 2 === 0
  return (
    <div style={{ width }}>
      {label && <div style={{ fontFamily: F.dongle, fontSize: 26, lineHeight: 1, color: '#000', marginBottom: 2 }}>{label}</div>}
      <div style={{ height: 56, borderRadius: 10, background: focused ? C.skyDark : C.sky, display: 'flex', alignItems: 'center', padding: '0 16px', fontFamily: F.sans, fontSize: 18 }}>
        {icon && <Icon name={icon} size={28} color={C.gray} style={{ marginRight: 12 }} />}
        {value ? <span style={{ color: C.gray }}>{value}</span> : <span style={{ color: C.gray, opacity: 0.85 }}>{placeholder}</span>}
        {focused && caret && blink && <span style={{ width: 2, height: 22, background: C.gray, marginLeft: value ? 1 : -1, order: value ? 0 : -1 }} />}
      </div>
    </div>
  )
}

/** CheckboxCard con casilla que se marca con un pequeño rebote. */
export function CheckRow({ name, p = 0 }) {
  return (
    <div style={{ height: 48, borderRadius: 10, background: C.sky, display: 'flex', alignItems: 'center', padding: '0 14px 0 15px' }}>
      <span style={{ fontFamily: F.sans, fontSize: 15, color: '#000' }}>{name}</span>
      <div style={{ marginLeft: 'auto', width: 20, height: 20, borderRadius: 3, border: `2px solid ${p > 0 ? C.blue : C.gray}`, background: p > 0 ? C.blue : 'transparent', display: 'grid', placeItems: 'center', transform: `scale(${p > 0 ? mix(0.7, 1, Math.min(p, 1.2)) : 1})`, boxSizing: 'border-box' }}>
        {p > 0 && (
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M4 12.5 9.5 18 20 6.5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="26" strokeDashoffset={26 * (1 - Math.min(1, p))} />
          </svg>
        )}
      </div>
    </div>
  )
}

/** Botón principal azul (CreateGasto / Ingresar). */
export function BlueButton({ text, press = 1, style }) {
  return (
    <div style={{ height: 50, borderRadius: 10, background: C.blue, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: F.head, fontWeight: 700, fontSize: 19, transform: `scale(${press})`, ...style }}>
      {text}
    </div>
  )
}

/** Avatar circular con inicial. */
export function Avatar({ name, size = 64, color = C.blue }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 99, background: color, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: F.head, fontWeight: 700, fontSize: size * 0.44, flexShrink: 0 }}>
      {name[0]}
    </div>
  )
}
