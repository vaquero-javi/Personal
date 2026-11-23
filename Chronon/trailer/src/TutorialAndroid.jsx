// Tutorial vertical: cómo instalar CHRONOS como app en Android (Chrome → menú ⋮ → Instalar aplicación).
// Misma estructura y ritmo que el de iOS (src/TutorialIOS.jsx); cambian el teléfono, el navegador,
// la pantalla de inicio, el permiso y la notificación.
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { AppIcon, C, F, accel, inOut, mix, out, prog } from './ui.jsx'
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

const BLUE = '#0b57d0' // azul de los botones de Android / Chrome
const SCREEN_R = 40 // radio de las esquinas de la pantalla

const CAPTIONS = [
  { at: 3.2, out: 8.4, chip: 'Paso 1 de 4', a: 'Abre la web en Chrome', b: URL },
  { at: 8.6, out: 12.9, chip: 'Paso 2 de 4', a: 'Toca el menú ⋮', b: 'arriba a la derecha' },
  { at: 13.1, out: 17.6, chip: 'Paso 3 de 4', a: 'Toca «Instalar aplicación»', b: 'o «Añadir a pantalla de inicio»' },
  { at: 17.8, out: 22.6, chip: 'Paso 4 de 4', a: 'Confirma con «Instalar»', b: 'y se añade a tu pantalla de inicio' },
  { at: 22.8, out: 29.8, chip: 'Listo', a: '¡Ya la tienes!', b: 'ábrela desde su icono' },
  { at: 30.0, out: 36.9, chip: 'Extra', a: 'Activa los avisos', b: 'Ajustes → Activar notificaciones', foot: 'Y Permitir cuando Android te pregunte' },
]

// Posiciones en la pantalla (390×844)
const MENU = { x: 150, y: 44, w: 232, top: 52, row: 46 }
const MENU_ITEMS = [
  'Nueva pestaña',
  'Nueva pestaña de incógnito',
  'Historial',
  'Borrar datos de navegación',
  'Descargas',
  'Marcadores',
  'Pestañas recientes',
  'Compartir…',
  'Buscar en la página',
  'Traducir…',
  'Instalar aplicación',
  'Versión para ordenadores',
  'Configuración',
]
const INSTALL_ROW = MENU_ITEMS.indexOf('Instalar aplicación')
const INSTALL_ROW_Y = MENU.y + MENU.top + INSTALL_ROW * MENU.row + MENU.row / 2
const DIALOG = { w: 312, h: 214 } // centrado en pantalla
const DIALOG_TOP = (844 - DIALOG.h) / 2
const INSTALL_BTN = { x: 322, y: DIALOG_TOP + DIALOG.h - 34 }
const ICON = { x: 30, y: 454, size: 60 } // hueco del icono nuevo en la pantalla de inicio
const PERMISSION = { w: 300, h: 244 }
const PERMISSION_TOP = (844 - PERMISSION.h) / 2
const ALLOW_Y = PERMISSION_TOP + 150

// Dedo: [segundo, x, y]
const FINGER = [
  [9.2, 300, 700],
  [10.5, 368, 68],
  [12.4, 290, 320],
  [14.3, 260, 400],
  [16.7, 250, INSTALL_ROW_Y],
  [19.0, 240, 640],
  [20.6, 250, 620],
  [21.6, INSTALL_BTN.x, INSTALL_BTN.y],
  [25.4, 230, 640],
  [26.5, ICON.x + ICON.size / 2, ICON.y + ICON.size / 2],
  [30.0, 260, 640],
  [30.9, 338, 801],
  [32.4, ACTIVATE_BTN.x + ACTIVATE_BTN.w / 2, ACTIVATE_BTN.y + ACTIVATE_BTN.h / 2],
  [34.1, 195, ALLOW_Y],
]
const FINGER_SHOW = [
  [9.2, 12.9],
  [13.6, 17.5],
  [18.8, 22.6],
  [25.2, 27.2],
  [29.8, 35.0],
]
const PRESSES = [11.0, 17.2, 22.3, 26.9, 31.1, 33.0, 34.5]

export function TutorialAndroid() {
  const f = useCurrentFrame()
  const t = f / TUTORIAL_FPS
  const p = (at, dur, ease = out) => prog(f, T(at), T(dur), ease)
  const phoneIn = p(2.4, 1.3)
  const phoneOut = p(37.2, 0.9, accel)
  const phoneY = (1 - phoneIn) * 1100 + phoneOut * 1500
  const phoneW = 560

  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: F.sans }}>
      <Ambient t={t} />
      <Intro f={f} device="en tu Android" />
      <Progress f={f} t={t} captions={CAPTIONS} />
      {CAPTIONS.map((c, i) => (
        <Caption key={i} f={f} c={c} />
      ))}
      <FullscreenNote f={f} text="Pantalla completa, sin barras de Chrome" />

      <div style={{ position: 'absolute', left: (1080 - phoneW * (1 + 20 / 390)) / 2, top: 570, transform: `translateY(${phoneY}px)` }}>
        <AndroidPhone width={phoneW}>
          <Screen t={t} f={f} />
          <Finger t={t} points={FINGER} show={FINGER_SHOW} presses={PRESSES} />
        </AndroidPhone>
        <div style={{ position: 'absolute', left: '12%', right: '12%', bottom: -40, height: 60, borderRadius: '50%', background: 'rgba(60,40,20,.18)', filter: 'blur(30px)', zIndex: -1 }} />
      </div>

      <End f={f} />
    </AbsoluteFill>
  )
}

/** Teléfono Android genérico: marco fino, esquinas redondeadas y cámara perforada. Pantalla de 390×844. */
function AndroidPhone({ width, children }) {
  const s = width / 390
  const bezel = 10 * s
  return (
    <div
      style={{
        position: 'relative',
        padding: bezel,
        background: '#111113',
        borderRadius: 50 * s,
        boxShadow: `0 0 0 ${3 * s}px #34343a, 0 ${50 * s}px ${100 * s}px -${20 * s}px rgba(0,0,0,.5)`,
      }}
    >
      {/* Botones laterales */}
      <div style={{ position: 'absolute', right: -5 * s, top: 190 * s, width: 4 * s, height: 70 * s, borderRadius: 4, background: '#2a2a2e' }} />
      <div style={{ position: 'absolute', right: -5 * s, top: 290 * s, width: 4 * s, height: 40 * s, borderRadius: 4, background: '#2a2a2e' }} />
      <div style={{ position: 'relative', width, height: 844 * s, overflow: 'hidden', borderRadius: SCREEN_R * s, background: C.paper }}>
        <div style={{ position: 'absolute', width: 390, height: 844, transform: `scale(${s})`, transformOrigin: '0 0' }}>{children}</div>
        <div style={{ position: 'absolute', top: 12 * s, left: '50%', width: 13 * s, height: 13 * s, marginLeft: -6.5 * s, borderRadius: 99, background: '#000', boxShadow: `0 0 0 ${1.5 * s}px #1b1b1e` }} />
      </div>
    </div>
  )
}

// ═══════════ Pantalla ═══════════

function Screen({ t, f }) {
  const p = (at, dur, ease = out) => prog(f, T(at), T(dur), ease)
  const toHome = p(22.9, 0.7, inOut)
  const openApp = p(27.1, 0.75, inOut)
  const showSettings = p(31.3, 0.45)
  const onHome = t >= 22.8 && openApp < 0.5

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {t >= 22.8 && <HomeScreen f={f} t={t} />}
      {toHome < 1 && (
        <Morph from={{ x: 0, y: 0, w: 390, h: 844, r: SCREEN_R }} to={{ x: ICON.x, y: ICON.y, w: ICON.size, h: ICON.size * (844 / 390), r: ICON.size / 2 }} p={toHome} fade={toHome}>
          <ChromeScreen t={t} f={f} />
        </Morph>
      )}
      {openApp > 0 && (
        <Morph from={{ x: ICON.x, y: ICON.y, w: ICON.size, h: ICON.size, r: ICON.size / 2 }} to={{ x: 0, y: 0, w: 390, h: 844, r: SCREEN_R }} p={openApp} fade={1 - Math.min(1, openApp * 3)} icon>
          <AppScreen />
          {showSettings > 0 && (
            <AbsoluteFill style={{ opacity: showSettings, transform: `translateX(${(1 - showSettings) * 24}px)` }}>
              <SettingsScreen f={f} t={t} Permission={AndroidPermission} />
            </AbsoluteFill>
          )}
        </Morph>
      )}
      <StatusBar light={onHome} />
      <Notification f={f} />
      <GestureBar light={onHome} />
    </AbsoluteFill>
  )
}

function StatusBar({ light }) {
  const color = light ? '#fff' : '#1f1f1f'
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, zIndex: 20, pointerEvents: 'none' }}>
      <span style={{ position: 'absolute', left: 26, top: 11, fontSize: 15, fontWeight: 500, color }}>9:41</span>
      <div style={{ position: 'absolute', right: 24, top: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
        <svg width="15" height="12" viewBox="0 0 16 12" fill={color}>
          <path d="M8 12 0 3.2a11.6 11.6 0 0 1 16 0z" />
        </svg>
        <svg width="13" height="13" viewBox="0 0 13 13" fill={color}>
          <path d="M13 0v13H0z" />
        </svg>
        <div style={{ width: 9, height: 15, borderRadius: 2, border: `1.4px solid ${color}`, padding: 1.4, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', height: '80%', borderRadius: 1, background: color }} />
        </div>
      </div>
    </div>
  )
}

function GestureBar({ light }) {
  return <div style={{ position: 'absolute', bottom: 9, left: '50%', width: 110, height: 4, marginLeft: -55, borderRadius: 99, background: light ? '#fff' : '#1f1f1f', opacity: 0.75, zIndex: 20 }} />
}

// ——— Chrome ———
function ChromeScreen({ t, f }) {
  const p = (at, dur, ease = out) => prog(f, T(at), T(dur), ease)
  const typed = Math.round(interpolate(t, [4.2, 5.4], [0, URL.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  const load = p(5.6, 0.7, inOut)
  const page = p(5.9, 0.6)
  const menu = p(11.2, 0.35)
  const menuAway = p(17.5, 0.25, accel)
  const dialog = p(17.85, 0.4)
  const dialogAway = p(22.45, 0.3, accel)
  const dim = dialog * (1 - dialogAway) * 0.32
  const dotsPressed = pressAmount(t, 11.0)

  return (
    <AbsoluteFill style={{ background: '#fff' }}>
      {/* Página */}
      <div style={{ position: 'absolute', top: 100, left: 0, width: 390, height: 744, overflow: 'hidden', opacity: page, background: C.paper }}>
        <Img src={SHOT} style={{ width: 390, height: 844, transform: `translateY(${(1 - page) * 8}px)` }} />
      </div>

      {/* Barra de Chrome arriba */}
      <div style={{ position: 'absolute', top: 40, left: 0, right: 0, height: 60, background: '#fff', boxShadow: '0 1px 0 rgba(0,0,0,.08)' }}>
        <svg style={{ position: 'absolute', left: 14, top: 18 }} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z" />
        </svg>
        <div style={{ position: 'absolute', left: 50, right: 82, top: 9, height: 42, borderRadius: 99, background: '#eef1f6', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', overflow: 'hidden' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" />
          </svg>
          <span style={{ fontSize: 15, color: typed ? '#1f1f1f' : '#5f6368', whiteSpace: 'nowrap' }}>
            {typed ? URL.slice(0, typed) : 'Busca o escribe una URL'}
          </span>
          {typed > 0 && typed < URL.length && <span style={{ width: 2, height: 20, background: BLUE, marginLeft: -6 }} />}
          {load > 0 && load < 1 && <div style={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${load * 100}%`, background: BLUE }} />}
        </div>
        <div style={{ position: 'absolute', right: 44, top: 19, width: 22, height: 22, borderRadius: 5, border: '2px solid #444', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: '#444' }}>1</div>
        <div style={{ position: 'absolute', right: 6, top: 8, width: 44, height: 44, display: 'grid', placeItems: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 99, background: 'rgba(11,87,208,.16)', opacity: dotsPressed, transform: `scale(${dotsPressed})` }} />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#444">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </div>
      </div>

      {menu > 0 && menuAway < 1 && <Menu t={t} a={menu * (1 - menuAway)} />}
      {dim > 0 && <AbsoluteFill style={{ background: '#000', opacity: dim }} />}
      {dialog > 0 && dialogAway < 1 && <InstallDialog f={f} t={t} a={dialog * (1 - dialogAway)} enter={dialog} />}
    </AbsoluteFill>
  )
}

const MENU_TOP_ICONS = ['M5 12h14M13 6l6 6-6 6', 'M12 4l2.4 5 5.6.7-4.1 3.8 1 5.5L12 16.4 7.1 19l1-5.5L4 9.7l5.6-.7z', 'M12 4v11M7 10l5 5 5-5M5 20h14', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01', 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4']

/** Menú ⋮ de Chrome: se despliega desde la esquina. */
function Menu({ t, a }) {
  const highlight = pressAmount(t, 17.2, 0.4)
  return (
    <div
      style={{
        position: 'absolute',
        left: MENU.x,
        top: MENU.y,
        width: MENU.w,
        borderRadius: 16,
        background: '#fff',
        boxShadow: '0 8px 30px rgba(0,0,0,.22)',
        overflow: 'hidden',
        opacity: a,
        transformOrigin: '100% 0',
        transform: `scale(${mix(0.85, 1, a)})`,
      }}
    >
      <div style={{ height: MENU.top, display: 'flex', justifyContent: 'space-around', alignItems: 'center', borderBottom: '1px solid #eee' }}>
        {MENU_TOP_ICONS.map((d, i) => (
          <svg key={i} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={d} />
          </svg>
        ))}
      </div>
      {MENU_ITEMS.map((label, i) => {
        const target = i === INSTALL_ROW
        return (
          <div
            key={label}
            style={{
              height: MENU.row,
              display: 'flex',
              alignItems: 'center',
              padding: '0 18px',
              fontSize: 15,
              color: '#1f1f1f',
              fontWeight: target ? 600 : 400,
              background: target ? `rgba(212,95,50,${0.1 + highlight * 0.12})` : '#fff',
            }}
          >
            {label}
          </div>
        )
      })}
    </div>
  )
}

/** Confirmación de Chrome para instalar la app web. */
function InstallDialog({ t, a, enter }) {
  const ring = interpolate(t, [19.6, 20.1, 20.9, 21.4], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const pressed = pressAmount(t, 22.3)
  return (
    <div
      style={{
        position: 'absolute',
        left: (390 - DIALOG.w) / 2,
        top: DIALOG_TOP,
        width: DIALOG.w,
        height: DIALOG.h,
        borderRadius: 28,
        background: '#f6f3f8',
        padding: '24px 24px 0',
        boxSizing: 'border-box',
        opacity: a,
        transform: `scale(${mix(0.92, 1, enter)})`,
        boxShadow: '0 12px 40px rgba(0,0,0,.25)',
      }}
    >
      <div style={{ fontSize: 22, color: '#1f1f1f', marginBottom: 18 }}>Instalar aplicación</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 99, overflow: 'hidden' }}>
          <Img src={staticFile('icon.png')} style={{ width: 48, height: 48 }} />
        </div>
        <div>
          <div style={{ fontSize: 16, color: '#1f1f1f', fontWeight: 500 }}>CHRONOS</div>
          <div style={{ fontSize: 13, color: '#5f6368', marginTop: 2 }}>{URL}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', right: 20, bottom: 14, display: 'flex', gap: 8, fontSize: 15, fontWeight: 500 }}>
        <span style={{ padding: '10px 12px', color: BLUE }}>Cancelar</span>
        <span style={{ position: 'relative', padding: '10px 14px', color: BLUE }}>
          <span style={{ position: 'absolute', inset: 0, borderRadius: 99, background: 'rgba(11,87,208,.14)', opacity: pressed, transform: `scale(${pressed})` }} />
          {ring > 0 && <span style={{ position: 'absolute', inset: -5, borderRadius: 99, border: `3px solid ${C.ember}`, opacity: ring, transform: `scale(${mix(1.2, 1, ring)})` }} />}
          Instalar
        </span>
      </div>
    </div>
  )
}

// ——— Pantalla de inicio ———
const HOME_COLORS = ['#e9d8c4', '#cfd9e3', '#d9e4d3', '#ead2cf', '#d8d2e6', '#e6dfc6', '#cde0de', '#e3d6dc', '#d6dbe8', '#e8dccd', '#d3e2d8', '#e0d4c8']

function HomeScreen({ f, t }) {
  const pop = prog(f, T(23.8), T(0.55), out)
  const iconScale = interpolate(f, [T(23.8), T(24.15), T(24.45)], [0, 1.1, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: out })
  const tap = pressAmount(t, 26.9)
  const glow = prog(f, T(24.3), T(0.6)) * (1 - prog(f, T(26.6), T(0.4)))
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(170deg, #26313a 0%, #3e4a4c 40%, #a0654a 100%)' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 50% at 30% 15%, rgba(255,220,190,.25), transparent 70%)' }} />
      {/* Reloj y fecha */}
      <div style={{ position: 'absolute', left: 30, top: 70, color: '#fff' }}>
        <div style={{ fontSize: 15, opacity: 0.85 }}>martes, 6 oct</div>
        <div style={{ fontSize: 64, fontWeight: 300, lineHeight: 1, marginTop: 6, letterSpacing: '-0.03em' }}>9:41</div>
      </div>
      {HOME_COLORS.map((c, i) => {
        const col = i % 4
        const row = Math.floor(i / 4)
        return (
          <div key={i} style={{ position: 'absolute', left: 30 + col * 90, top: 166 + row * 96, width: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 60, height: 60, borderRadius: 99, background: c, opacity: 0.92, boxShadow: '0 2px 6px rgba(0,0,0,.18)' }} />
            <div style={{ width: 38, height: 6, borderRadius: 3, background: 'rgba(255,255,255,.5)' }} />
          </div>
        )
      })}
      <div style={{ position: 'absolute', left: ICON.x, top: ICON.y, width: ICON.size, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, opacity: pop }}>
        {glow > 0 && <div style={{ position: 'absolute', top: -10, width: 80, height: 80, borderRadius: 99, background: 'rgba(255,240,220,.45)', filter: 'blur(10px)', opacity: glow }} />}
        <div style={{ width: ICON.size, height: ICON.size, borderRadius: 99, overflow: 'hidden', transform: `scale(${iconScale * (1 - tap * 0.08)})`, boxShadow: '0 4px 12px rgba(0,0,0,.3)' }}>
          <Img src={staticFile('icon.png')} style={{ width: ICON.size, height: ICON.size }} />
        </div>
        <span style={{ fontSize: 12, color: '#fff', fontWeight: 500, textShadow: '0 1px 3px rgba(0,0,0,.4)' }}>CHRONOS</span>
      </div>
      {/* Dock y buscador */}
      <div style={{ position: 'absolute', left: 30, right: 30, bottom: 104, display: 'flex', justifyContent: 'space-between' }}>
        {['#d5e3d6', '#cfdcea', '#e7d7c6', '#e4d2df'].map((c, i) => (
          <div key={i} style={{ width: 60, height: 60, borderRadius: 99, background: c, opacity: 0.92 }} />
        ))}
      </div>
      <div style={{ position: 'absolute', left: 22, right: 22, bottom: 36, height: 52, borderRadius: 99, background: 'rgba(255,255,255,.88)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2" strokeLinecap="round">
          <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
        </svg>
        <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#d9d9de', maxWidth: 120 }} />
      </div>
    </AbsoluteFill>
  )
}

// ——— Permiso y notificación de Android ———
/** Permiso de notificaciones de Android 13+: icono, pregunta y dos botones apilados. */
function AndroidPermission({ a, enter, allowPress }) {
  return (
    <AbsoluteFill style={{ background: `rgba(0,0,0,${0.32 * a})` }}>
      <div
        style={{
          position: 'absolute',
          left: (390 - PERMISSION.w) / 2,
          top: PERMISSION_TOP,
          width: PERMISSION.w,
          height: PERMISSION.h,
          borderRadius: 28,
          background: '#f6f3f8',
          opacity: a,
          transform: `scale(${mix(0.92, 1, enter)})`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '24px 20px 16px',
          boxSizing: 'border-box',
          fontFamily: F.sans,
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14zM10 20.5a2 2 0 0 0 4 0" />
        </svg>
        <div style={{ fontSize: 18, color: '#1f1f1f', textAlign: 'center', lineHeight: 1.35, marginTop: 14 }}>
          ¿Permitir que <b style={{ fontWeight: 600 }}>CHRONOS</b> te envíe notificaciones?
        </div>
        <div style={{ marginTop: 'auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ height: 44, borderRadius: 99, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 500, color: BLUE, background: `rgba(11,87,208,${0.1 + allowPress * 0.12})` }}>Permitir</div>
          <div style={{ height: 44, borderRadius: 99, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 500, color: BLUE }}>No permitir</div>
        </div>
      </div>
    </AbsoluteFill>
  )
}

/** Notificación emergente de Android con la sesión de estudio. */
function Notification({ f }) {
  const a = prog(f, T(35.7), T(0.6))
  const gone = prog(f, T(37.3), T(0.4), accel)
  if (a <= 0) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: 10,
        right: 10,
        top: 44,
        zIndex: 30,
        padding: '14px 16px',
        borderRadius: 24,
        background: 'rgba(248,246,250,.97)',
        boxShadow: '0 12px 30px -10px rgba(0,0,0,.35)',
        transform: `translateY(${(1 - a) * -150 - gone * 150}px)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5f6368' }}>
        <div style={{ width: 18, height: 18, borderRadius: 99, overflow: 'hidden' }}>
          <AppIcon size={18} style={{ borderRadius: 0 }} />
        </div>
        CHRONOS · ahora
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#1f1f1f', marginTop: 8 }}>📚 Estudiar: Tema 3 (1/2)</div>
      <div style={{ fontSize: 14, color: '#444', marginTop: 2 }}>Empieza ahora · 09:00–10:30</div>
    </div>
  )
}
