// Tutorial vertical: cómo instalar CHRONOS como app en un iPhone (Safari → Compartir → Añadir a pantalla de inicio).
// Un solo iPhone en plano todo el vídeo; lo que cambia es su pantalla y el rótulo de arriba.
// Movimiento "premium" de la casa: curva `out` para entrar, `accel` para salir, sin rebotes salvo el icono nuevo.
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { AppIcon, C, F, IPhone, accel, inOut, mix, out, prog } from './ui.jsx'
import {
  ACTIVATE_BTN,
  Ambient,
  AppScreen,
  Caption,
  End,
  Finger,
  FullscreenNote,
  Intro,
  Morph,
  Progress,
  SHOT,
  SettingsScreen,
  T,
  TUTORIAL_FPS,
  URL,
  pressAmount,
} from './tutorial/shared.jsx'


const BLUE = '#0a7aff'

// ——— Guion (segundos) ———
const CAPTIONS = [
  { at: 3.2, out: 8.4, chip: 'Paso 1 de 4', a: 'Abre la web en Safari', b: URL },
  { at: 8.6, out: 12.9, chip: 'Paso 2 de 4', a: 'Toca Compartir', b: 'el cuadrado con la flecha', foot: '¿No lo ves? Toca ··· y luego Compartir' },
  { at: 13.1, out: 17.6, chip: 'Paso 3 de 4', a: 'Añadir a pantalla de inicio', b: 'desliza hacia arriba si no aparece' },
  { at: 17.8, out: 22.6, chip: 'Paso 4 de 4', a: 'Deja «Abrir como app web»', b: 'y toca Añadir' },
  { at: 22.8, out: 29.8, chip: 'Listo', a: '¡Ya la tienes!', b: 'ábrela desde su icono' },
  { at: 30.0, out: 36.9, chip: 'Extra', a: 'Activa los avisos', b: 'Ajustes → Activar notificaciones', foot: 'Solo funcionan desde la app instalada' },
]

// Dedo: [segundo, x, y] en coordenadas de la pantalla (390×844). null = oculto.
const FINGER = [
  [9.2, 300, 900],
  [10.5, 195, 806],
  [12.4, 205, 640],
  [14.3, 205, 690],
  [15.5, 205, 520],
  [16.7, 150, 0], // y se calcula: fila «Añadir a pantalla de inicio»
  [19.0, 300, 261],
  [20.6, 340, 261],
  [21.6, 349, 82],
  [25.4, 230, 620],
  [26.5, 0, 0], // icono nuevo
  [30.0, 260, 640],
  [30.9, 338, 801],
  [32.4, 120, 0], // botón Activar
  [34.1, 268, 0], // Permitir
]
const FINGER_SHOW = [
  [9.2, 12.9],
  [13.6, 17.5],
  [18.8, 22.6],
  [25.2, 27.2],
  [29.8, 35.0],
]
const PRESSES = [11.0, 17.2, 22.3, 26.9, 31.1, 33.0, 34.5]

// Posiciones fijas de la pantalla
const SHARE_ROW_Y = 430 // fila «Añadir a pantalla de inicio» tras desplazar la hoja
const ICON = { x: 27, y: 382, size: 64 } // hueco del icono nuevo en la pantalla de inicio
const ALERT_ALLOW = { x: 262, y: 480 }

export function TutorialIOS() {
  const f = useCurrentFrame()
  const t = f / TUTORIAL_FPS
  const p = (at, dur, ease = out) => prog(f, T(at), T(dur), ease)

  // Teléfono: sube al terminar la intro y baja al final.
  const phoneIn = p(2.4, 1.3)
  const phoneOut = p(37.2, 0.9, accel)
  const phoneY = (1 - phoneIn) * 1100 + phoneOut * 1500
  const phoneW = 560
  const scale = phoneW / 390

  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: F.sans }}>
      <Ambient t={t} />
      <Intro f={f} device="en tu iPhone" />
      <Progress f={f} t={t} captions={CAPTIONS} />
      {CAPTIONS.map((c, i) => (
        <Caption key={i} f={f} c={c} />
      ))}
      <FullscreenNote f={f} text="Pantalla completa, sin barras de Safari" />

      <div style={{ position: 'absolute', left: (1080 - phoneW - 26 * scale) / 2, top: 570, transform: `translateY(${phoneY}px)` }}>
        <IPhone width={phoneW} dark>
          <Screen t={t} f={f} />
          <Finger t={t} points={FINGER.map((_, i) => [FINGER[i][0], ...fingerTarget(i)])} show={FINGER_SHOW} presses={PRESSES} />
        </IPhone>
        {/* Sombra de contacto que respira con el teléfono */}
        <div style={{ position: 'absolute', left: '12%', right: '12%', bottom: -40, height: 60, borderRadius: '50%', background: 'rgba(60,40,20,.18)', filter: 'blur(30px)', zIndex: -1 }} />
      </div>

      <End f={f} />
    </AbsoluteFill>
  )
}

// ═══════════ Capas de fondo y texto ═══════════







// ═══════════ Pantalla del iPhone (390×844) ═══════════

function Screen({ t, f }) {
  const p = (at, dur, ease = out) => prog(f, T(at), T(dur), ease)

  // Safari se encoge hacia el hueco del icono al añadirla; la app se abre desde ese mismo hueco.
  const toHome = p(22.9, 0.7, inOut)
  const openApp = p(27.1, 0.75, inOut)
  const showSettings = p(31.3, 0.45)

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {t >= 22.8 && <HomeScreen f={f} t={t} />}
      {toHome < 1 && (
        <Morph from={{ x: 0, y: 0, w: 390, h: 844, r: 54 }} to={{ x: ICON.x, y: ICON.y, w: ICON.size, h: ICON.size * (844 / 390), r: 16 }} p={toHome} fade={toHome}>
          <SafariScreen t={t} f={f} />
        </Morph>
      )}
      {openApp > 0 && (
        <Morph from={{ x: ICON.x, y: ICON.y, w: ICON.size, h: ICON.size, r: 16 }} to={{ x: 0, y: 0, w: 390, h: 844, r: 54 }} p={openApp} fade={1 - Math.min(1, openApp * 3)} icon>
          <AppScreen />
          {showSettings > 0 && (
            <AbsoluteFill style={{ opacity: showSettings, transform: `translateX(${(1 - showSettings) * 24}px)` }}>
              <SettingsScreen f={f} t={t} Permission={IOSPermission} />
            </AbsoluteFill>
          )}
        </Morph>
      )}
      <StatusBar dark={t >= 22.8 && openApp < 0.5} />
      <Banner f={f} />
      <HomeIndicator dark={!(t >= 22.8 && openApp < 0.5)} />
    </AbsoluteFill>
  )
}


function StatusBar({ dark }) {
  const color = dark ? '#fff' : '#000'
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 54, zIndex: 20, pointerEvents: 'none' }}>
      <span style={{ position: 'absolute', left: 44, top: 17, fontSize: 17, fontWeight: 600, color, letterSpacing: '-0.01em' }}>9:41</span>
      <div style={{ position: 'absolute', right: 30, top: 21, display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="18" height="12" viewBox="0 0 18 12">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={i * 4.6} y={9 - i * 3} width="3.2" height={3 + i * 3} rx="1" fill={color} />
          ))}
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill={color}>
          <path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0zM3.5 6.9a6.4 6.4 0 0 1 9 0l-1.4 1.5a4.4 4.4 0 0 0-6.2 0zM1.2 4.6a9.6 9.6 0 0 1 13.6 0l-1.4 1.5a7.6 7.6 0 0 0-10.8 0z" />
        </svg>
        <div style={{ width: 25, height: 12, borderRadius: 4, border: `1.2px solid ${color}`, opacity: 0.9, padding: 1.5 }}>
          <div style={{ width: '78%', height: '100%', borderRadius: 2, background: color }} />
        </div>
      </div>
    </div>
  )
}

function HomeIndicator({ dark }) {
  return <div style={{ position: 'absolute', bottom: 8, left: '50%', width: 134, height: 5, marginLeft: -67, borderRadius: 99, background: dark ? '#000' : '#fff', opacity: 0.85, zIndex: 20 }} />
}

// ——— Safari ———
function SafariScreen({ t, f }) {
  const p = (at, dur, ease = out) => prog(f, T(at), T(dur), ease)
  const typed = Math.round(interpolate(t, [4.2, 5.4], [0, URL.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  const load = p(5.6, 0.7, inOut)
  const page = p(5.9, 0.6)
  const sheet = p(11.2, 0.5)
  const sheetAway = p(17.6, 0.4, accel)
  const dialog = p(17.85, 0.55)
  const dialogAway = p(22.45, 0.4, accel)
  const dim = Math.max(sheet * (1 - sheetAway), dialog * (1 - dialogAway)) * 0.3
  const sharePressed = pressAmount(t, 11.0)

  return (
    <AbsoluteFill style={{ background: '#fff' }}>
      {/* Página: aparece cuando termina de cargar */}
      <div style={{ position: 'absolute', top: 54, left: 0, width: 390, height: 690, overflow: 'hidden', opacity: page, background: C.paper }}>
        <Img src={SHOT} style={{ width: 390, height: 844, transform: `translateY(${(1 - page) * 8}px)` }} />
      </div>
      {t < 5.9 && (
        <div style={{ position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center', color: '#b8b8bd', fontSize: 15, opacity: t < 4.1 ? 1 : 0 }}>Favoritos</div>
      )}

      {/* Barra de Safari abajo */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 108, background: 'rgba(248,248,250,.94)', borderTop: '0.5px solid rgba(0,0,0,.12)' }}>
        <div style={{ position: 'absolute', left: 14, right: 14, top: 8, height: 46, borderRadius: 14, background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,.12)', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', left: 14, top: 13, fontSize: 15, fontWeight: 600, color: '#111' }}>
            <span style={{ fontSize: 12 }}>A</span>A
          </span>
          <div style={{ position: 'absolute', left: 50, right: 44, top: 0, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 16, color: typed ? '#111' : '#8e8e93' }}>
            {page > 0.5 && (
              <svg width="10" height="13" viewBox="0 0 10 13" fill="#111">
                <path d="M2 5.5V4a3 3 0 0 1 6 0v1.5h.5A1.5 1.5 0 0 1 10 7v4.5A1.5 1.5 0 0 1 8.5 13h-7A1.5 1.5 0 0 1 0 11.5V7a1.5 1.5 0 0 1 1.5-1.5zm1.4 0h3.2V4a1.6 1.6 0 0 0-3.2 0z" />
              </svg>
            )}
            {typed ? URL.slice(0, typed) : 'Buscar o escribir web'}
            {typed > 0 && typed < URL.length && <span style={{ width: 2, height: 20, background: BLUE, marginLeft: 1 }} />}
          </div>
          <svg style={{ position: 'absolute', right: 14, top: 14 }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round">
            <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" />
          </svg>
          {/* Barra de carga */}
          {load > 0 && load < 1 && <div style={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${load * 100}%`, background: BLUE }} />}
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 62, height: 34, display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '0 8px' }}>
          <ToolIcon d="M15 5 8 12l7 7" />
          <ToolIcon d="M9 5l7 7-7 7" faint />
          <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
            <div style={{ position: 'absolute', width: 44, height: 44, borderRadius: 99, background: 'rgba(10,122,255,.16)', transform: `scale(${sharePressed})`, opacity: sharePressed }} />
            <ToolIcon d="M12 15V3M7.5 7.5 12 3l4.5 4.5M7 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18.5 10H17" />
          </div>
          <ToolIcon d="M4 5.5C6 4.5 9 4.5 12 6.5c3-2 6-2 8-1v13c-2-1-5-1-8 1-3-2-6-2-8-1z M12 6.5v13" />
          <ToolIcon d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H16M4 9.5A1.5 1.5 0 0 1 5.5 8h9A1.5 1.5 0 0 1 16 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 18.5z" />
        </div>
      </div>

      {dim > 0 && <AbsoluteFill style={{ background: '#000', opacity: dim }} />}
      {sheet > 0 && sheetAway < 1 && <ShareSheet f={f} t={t} y={(1 - sheet) * 760 + sheetAway * 760} />}
      {dialog > 0 && dialogAway < 1 && <AddDialog f={f} t={t} y={(1 - dialog) * 800 + dialogAway * 800} />}
    </AbsoluteFill>
  )
}

function ToolIcon({ d, faint }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: faint ? 0.3 : 1 }}>
      <path d={d} />
    </svg>
  )
}

/** Hoja de Compartir: se desplaza hacia arriba para enseñar «Añadir a pantalla de inicio». */
function ShareSheet({ f, t, y }) {
  const scroll = interpolate(t, [14.3, 15.5], [0, -150], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: inOut })
  const highlight = pressAmount(t, 17.2, 0.6)
  const ROWS = [
    ['Copiar', 'M8 8V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H16M4 9.5A1.5 1.5 0 0 1 5.5 8h9A1.5 1.5 0 0 1 16 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 18.5z'],
    ['Añadir a la lista de lectura', 'M3 12c3-5 15-5 18 0-3 5-15 5-18 0zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
    ['Añadir marcador', 'M4 5.5C6 4.5 9 4.5 12 6.5c3-2 6-2 8-1v13c-2-1-5-1-8 1-3-2-6-2-8-1z'],
    ['Añadir a favoritos', 'M12 4l2.4 5 5.6.7-4.1 3.8 1 5.5L12 16.4 7.1 19l1-5.5L4 9.7l5.6-.7z'],
    ['Buscar en la página', 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4'],
    ['Añadir a pantalla de inicio', 'M5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4zM12 8v8M8 12h8'],
    ['Marcación', 'M4 20l1.2-4.2L16.6 4.4a2.1 2.1 0 0 1 3 3L8.2 18.8 4 20z'],
    ['Imprimir', 'M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z'],
  ]
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 120 + y, bottom: -y, background: '#f2f2f7', borderRadius: '14px 14px 0 0', overflow: 'hidden', boxShadow: '0 -10px 30px rgba(0,0,0,.15)' }}>
      <div style={{ transform: `translateY(${scroll}px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 18px 14px' }}>
          <AppIcon size={46} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#111' }}>CHRONOS</div>
            <div style={{ fontSize: 13, color: '#8e8e93' }}>{URL}</div>
          </div>
          <div style={{ width: 30, height: 30, borderRadius: 99, background: '#e3e3e8', display: 'grid', placeItems: 'center', color: '#8e8e93', fontSize: 15, fontWeight: 600 }}>✕</div>
        </div>
        <div style={{ height: 0.5, background: 'rgba(0,0,0,.12)', margin: '0 18px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '16px 6px 18px' }}>
          {['#4c9df8', '#5ac46a', '#7f8cf0', '#f2b33d'].map((c, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 60, height: 60, borderRadius: 16, background: c, opacity: 0.85 }} />
              <div style={{ width: 44, height: 7, borderRadius: 4, background: '#c7c7cc' }} />
            </div>
          ))}
        </div>
        <div style={{ margin: '0 16px', background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
          {ROWS.map(([label, d], i) => {
            const target = i === 5
            return (
              <div
                key={label}
                style={{
                  position: 'relative',
                  height: 50,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 16px',
                  borderTop: i ? '0.5px solid rgba(0,0,0,.1)' : 'none',
                  background: target ? `rgba(212,95,50,${0.1 + highlight * 0.12})` : '#fff',
                }}
              >
                <span style={{ fontSize: 16, color: '#111', fontWeight: target ? 600 : 400 }}>{label}</span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d={d} />
                </svg>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Ventana «Añadir a pantalla de inicio» con el interruptor «Abrir como app web». */
function AddDialog({ f, t, y }) {
  const ring = prog(f, T(19.6), T(0.5)) * (1 - prog(f, T(20.9), T(0.5), accel))
  const addPressed = pressAmount(t, 22.3)
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 54 + y, bottom: -y, background: '#f2f2f7', borderRadius: '14px 14px 0 0', boxShadow: '0 -10px 30px rgba(0,0,0,.15)' }}>
      <div style={{ position: 'relative', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', fontSize: 16 }}>
        <span style={{ color: BLUE }}>Cancelar</span>
        <span style={{ fontWeight: 600, color: '#111', fontSize: 15 }}>Añadir a pantalla de inicio</span>
        <span style={{ position: 'relative', color: BLUE, fontWeight: 600 }}>
          <span style={{ position: 'absolute', inset: '-8px -12px', borderRadius: 99, background: 'rgba(10,122,255,.15)', opacity: addPressed, transform: `scale(${addPressed})` }} />
          Añadir
        </span>
      </div>
      <div style={{ margin: '14px 16px 0', background: '#fff', borderRadius: 12, padding: 14, display: 'flex', gap: 14, alignItems: 'center' }}>
        <AppIcon size={62} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, color: '#111', paddingBottom: 8, borderBottom: '0.5px solid rgba(0,0,0,.15)' }}>CHRONOS</div>
          <div style={{ fontSize: 14, color: '#8e8e93', paddingTop: 8 }}>https://{URL}/</div>
        </div>
      </div>
      <div style={{ position: 'relative', margin: '22px 16px 0', background: '#fff', borderRadius: 12, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
        <span style={{ fontSize: 16, color: '#111' }}>Abrir como app web</span>
        <div style={{ position: 'relative', width: 51, height: 31, borderRadius: 99, background: '#34c759' }}>
          <div style={{ position: 'absolute', right: 2, top: 2, width: 27, height: 27, borderRadius: 99, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,.2)' }} />
          {ring > 0 && <div style={{ position: 'absolute', inset: -7, borderRadius: 99, border: `3px solid ${C.ember}`, opacity: ring, transform: `scale(${mix(1.25, 1, ring)})` }} />}
        </div>
      </div>
      <p style={{ margin: '10px 32px 0', fontSize: 13, lineHeight: 1.4, color: '#8e8e93' }}>Se añadirá un icono a tu pantalla de inicio para acceder rápidamente a esta web.</p>
    </div>
  )
}

// ——— Pantalla de inicio ———
const HOME_COLORS = ['#e9d8c4', '#cfd9e3', '#d9e4d3', '#ead2cf', '#d8d2e6', '#e6dfc6', '#cde0de', '#e3d6dc', '#d6dbe8', '#e8dccd', '#d3e2d8', '#e0d4c8']

function HomeScreen({ f, t }) {
  const pop = prog(f, T(23.8), T(0.55), out)
  // Pequeño rebote solo aquí: es la recompensa del tutorial.
  const iconScale = interpolate(f, [T(23.8), T(24.15), T(24.45)], [0, 1.1, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: out })
  const tap = pressAmount(t, 26.9)
  const glow = prog(f, T(24.3), T(0.6)) * (1 - prog(f, T(26.6), T(0.4)))
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(160deg, #3b2a24 0%, #7a3e27 45%, #c2683e 100%)' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 50% at 70% 20%, rgba(255,210,170,.35), transparent 70%)' }} />
      {HOME_COLORS.map((c, i) => {
        const col = i % 4
        const row = Math.floor(i / 4)
        return (
          <div key={i} style={{ position: 'absolute', left: 27 + col * 90.7, top: 82 + row * 100, width: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 64, height: 64, borderRadius: 15, background: c, opacity: 0.92, boxShadow: '0 2px 6px rgba(0,0,0,.15)' }} />
            <div style={{ width: 38, height: 6, borderRadius: 3, background: 'rgba(255,255,255,.55)' }} />
          </div>
        )
      })}
      <div style={{ position: 'absolute', left: ICON.x, top: ICON.y, width: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, opacity: pop }}>
        {glow > 0 && <div style={{ position: 'absolute', top: -10, width: 84, height: 84, borderRadius: 24, background: 'rgba(255,240,220,.45)', filter: 'blur(10px)', opacity: glow }} />}
        <div style={{ transform: `scale(${iconScale * (1 - tap * 0.08)})` }}>
          <AppIcon size={64} style={{ boxShadow: '0 4px 12px rgba(0,0,0,.3)' }} />
        </div>
        <span style={{ fontSize: 12, color: '#fff', fontWeight: 500, textShadow: '0 1px 3px rgba(0,0,0,.4)' }}>CHRONOS</span>
      </div>
      {/* Dock */}
      <div style={{ position: 'absolute', left: 12, right: 12, bottom: 22, height: 90, borderRadius: 32, background: 'rgba(255,255,255,.22)', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '0 10px' }}>
        {['#d5e3d6', '#cfdcea', '#e7d7c6', '#e4d2df'].map((c, i) => (
          <div key={i} style={{ width: 62, height: 62, borderRadius: 15, background: c, opacity: 0.92 }} />
        ))}
      </div>
    </AbsoluteFill>
  )
}

// ——— La app abierta ———




/** Notificación de una sesión de estudio que llega al final. */
function Banner({ f }) {
  const a = prog(f, T(35.7), T(0.6))
  const gone = prog(f, T(37.3), T(0.4), accel)
  if (a <= 0) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: 10,
        right: 10,
        top: 54,
        zIndex: 30,
        padding: '12px 14px',
        borderRadius: 22,
        background: 'rgba(250,249,246,.92)',
        boxShadow: '0 12px 30px -10px rgba(0,0,0,.35)',
        display: 'flex',
        gap: 11,
        alignItems: 'center',
        transform: `translateY(${(1 - a) * -150 - gone * 150}px)`,
      }}
    >
      <AppIcon size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ fontWeight: 600, color: '#111' }}>📚 Estudiar: Tema 3 (1/2)</span>
          <span style={{ color: '#8e8e93' }}>ahora</span>
        </div>
        <div style={{ fontSize: 13, color: '#333', marginTop: 2 }}>Empieza ahora · 09:00–10:30</div>
      </div>
    </div>
  )
}

// ═══════════ Dedo ═══════════


function fingerTarget(i) {
  const [s, x, y] = FINGER[i]
  if (s === 16.7) return [x, SHARE_ROW_Y]
  if (s === 26.5) return [ICON.x + ICON.size / 2, ICON.y + ICON.size / 2]
  if (s === 32.4) return [ACTIVATE_BTN.x + ACTIVATE_BTN.w / 2, ACTIVATE_BTN.y + ACTIVATE_BTN.h / 2]
  if (s === 34.1) return [ALERT_ALLOW.x, ALERT_ALLOW.y]
  return [x, y]
}


/** Permiso de notificaciones de iOS. */
function IOSPermission({ a, enter, allowPress }) {
  return (
    <AbsoluteFill style={{ background: `rgba(0,0,0,${0.28 * a})`, display: 'grid', placeItems: 'center' }}>
      <div style={{ width: 270, borderRadius: 14, background: 'rgba(242,242,247,.97)', textAlign: 'center', opacity: a, transform: `scale(${mix(1.12, 1, enter)})`, overflow: 'hidden', fontFamily: F.sans }}>
        <div style={{ padding: '18px 16px 16px' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#111', lineHeight: 1.3 }}>«CHRONOS» quiere enviarte notificaciones</div>
          <div style={{ fontSize: 13, color: '#333', marginTop: 6, lineHeight: 1.35 }}>Pueden ser alertas, sonidos y globos en los iconos.</div>
        </div>
        <div style={{ display: 'flex', borderTop: '0.5px solid rgba(0,0,0,.2)', height: 44, fontSize: 16 }}>
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: BLUE, borderRight: '0.5px solid rgba(0,0,0,.2)' }}>No permitir</div>
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: BLUE, fontWeight: 600, background: `rgba(0,0,0,${allowPress * 0.08})` }}>Permitir</div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
