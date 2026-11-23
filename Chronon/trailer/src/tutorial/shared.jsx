// Piezas comunes de los tutoriales de instalación (iOS y Android): rótulos, dedo, la app abierta y sus Ajustes.
// Cada tutorial pone solo lo de su sistema (navegador, pantalla de inicio, permisos y notificación).
import { AbsoluteFill, Img, interpolate, staticFile } from 'remotion'
import { AppIcon, C, F, Logo, Words, accel, inOut, mix, out, prog } from '../ui.jsx'

export const TUTORIAL_FPS = 30
export const T = (s) => Math.round(s * TUTORIAL_FPS)
export const TUTORIAL_FRAMES = T(41)
export const URL = 'chronos-crm.vercel.app'
export const SHOT = staticFile('cap/iphone-home.png')
// La barra de la app empieza en y≈770 de la captura: arriba se baja 44 px para la barra de estado, abajo se deja en su sitio.

/** Ajustes: dónde está el botón «Activar notificaciones» en la pantalla (390×844). */
export const ACTIVATE_BTN = { x: 37, y: 370, w: 170, h: 40 }

/** Fondo de papel con un brillo cálido que deriva despacio (capa ambiental). */
export function Ambient({ t }) {
  const x = 50 + Math.sin(t * 0.35) * 8
  const y = 62 + Math.cos(t * 0.28) * 5
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 70% 40% at ${x}% ${y}%, rgba(212,95,50,.13) 0%, rgba(212,95,50,0) 70%), radial-gradient(ellipse 90% 70% at 50% 30%, #fffefb 0%, ${C.paper} 55%, ${C.paper2} 100%)`,
      }}
    />
  )
}

export function Intro({ f, device }) {
  const logo = prog(f, T(0.2), T(0.9))
  const gone = prog(f, T(2.5), T(0.6), accel)
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 140 }}>
      <div style={{ opacity: logo * (1 - gone), transform: `translateY(${(1 - logo) * 30 - gone * 40}px) scale(${mix(0.9, 1, logo)})`, marginBottom: 56 }}>
        <Logo size={150} color={C.ink} />
      </div>
      <Words
        text="Instala CHRONOS"
        at={T(0.5)}
        exitAt={T(2.5)}
        style={{ fontWeight: 600, fontSize: 92, letterSpacing: '-0.035em', color: C.ink, lineHeight: 1.05 }}
      />
      <Words
        text={device}
        at={T(0.85)}
        exitAt={T(2.55)}
        style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: 104, color: C.ember, lineHeight: 1.05 }}
      />
      <Words
        text="en menos de un minuto"
        at={T(1.3)}
        exitAt={T(2.6)}
        style={{ fontFamily: F.mono, fontSize: 30, color: C.ink5, marginTop: 34, letterSpacing: '0.02em' }}
      />
    </AbsoluteFill>
  )
}

/** Puntos de progreso arriba (capa secundaria): el actual se alarga en ember. */
export function Progress({ f, t, captions }) {
  const show = prog(f, T(3.0), T(0.6)) * (1 - prog(f, T(37.0), T(0.6), accel))
  const current = captions.findIndex((c) => t >= c.at && t < c.out + 0.2)
  return (
    <div style={{ position: 'absolute', top: 96, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 12, opacity: show }}>
      {captions.map((c, i) => {
        const on = prog(f, T(c.at), T(0.5), inOut)
        const off = prog(f, T(c.out), T(0.4), inOut)
        const active = on * (1 - off)
        const done = i < current || (current === -1 && t > c.out)
        return (
          <span
            key={i}
            style={{
              height: 10,
              width: 10 + 36 * active,
              borderRadius: 99,
              background: active > 0.01 ? C.ember : done ? C.ink : 'rgba(28,27,24,.16)',
            }}
          />
        )
      })}
    </div>
  )
}

export function Caption({ f, c }) {
  const at = T(c.at)
  const exit = T(c.out)
  if (f < at - 2 || f > exit + T(0.8)) return null
  const chip = prog(f, at, T(0.5)) * (1 - prog(f, exit, T(0.4), accel))
  return (
    <div style={{ position: 'absolute', top: 150, left: 60, right: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <span
        style={{
          fontFamily: F.mono,
          fontSize: 26,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: C.ember,
          opacity: chip,
          transform: `translateY(${(1 - chip) * 12}px)`,
          marginBottom: 22,
        }}
      >
        {c.chip}
      </span>
      <Words text={c.a} at={at + 3} exitAt={exit} stagger={3} dur={22} style={{ fontWeight: 600, fontSize: 70, letterSpacing: '-0.03em', color: C.ink, lineHeight: 1.05 }} />
      <Words text={c.b} at={at + 9} exitAt={exit} stagger={3} dur={22} style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: 62, color: C.ember, lineHeight: 1.1, marginTop: 6 }} />
      {c.foot && (
        <Words text={c.foot} at={at + 22} exitAt={exit} stagger={2} dur={20} style={{ fontSize: 30, color: C.ink5, marginTop: 20, letterSpacing: '-0.01em' }} />
      )}
    </div>
  )
}

/** Remate del paso «¡Ya la tienes!»: la app abre a pantalla completa, sin el navegador. */
export function FullscreenNote({ f, text }) {
  const a = prog(f, T(28.2), T(0.6)) * (1 - prog(f, T(29.6), T(0.4), accel))
  if (a <= 0) return null
  return (
    <div style={{ position: 'absolute', top: 470, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 5 }}>
      <span
        style={{
          padding: '14px 28px',
          borderRadius: 99,
          background: C.ink,
          color: C.paper,
          fontSize: 30,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          opacity: a,
          transform: `translateY(${(1 - a) * 20}px) scale(${mix(0.95, 1, a)})`,
          boxShadow: '0 20px 40px -18px rgba(0,0,0,.45)',
        }}
      >
        {text}
      </span>
    </div>
  )
}

export function End({ f }) {
  const a = prog(f, T(37.8), T(0.9))
  if (a <= 0) return null
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 30}px) scale(${mix(0.92, 1, a)})`, marginBottom: 50 }}>
        <AppIcon size={190} style={{ boxShadow: '0 30px 60px -24px rgba(60,30,10,.45)' }} />
      </div>
      <Words text="Todo tu día," at={T(38.1)} style={{ fontWeight: 600, fontSize: 84, letterSpacing: '-0.035em', color: C.ink, lineHeight: 1.05 }} />
      <Words text="a un toque" at={T(38.4)} style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: 96, color: C.ember, lineHeight: 1.05 }} />
      <Words text={URL} at={T(39.0)} style={{ fontFamily: F.mono, fontSize: 32, color: C.ink5, marginTop: 40 }} />
    </AbsoluteFill>
  )
}

/** Lleva una vista de un rectángulo a otro (encoger a icono / abrir desde icono). */
export function Morph({ from, to, p, fade = 0, icon = false, children }) {
  const x = mix(from.x, to.x, p)
  const y = mix(from.y, to.y, p)
  const w = mix(from.w, to.w, p)
  const h = mix(from.h, to.h, p)
  const r = mix(from.r, to.r, p)
  const s = w / 390
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: r, overflow: 'hidden', boxShadow: p > 0 && p < 1 ? '0 20px 40px rgba(0,0,0,.35)' : 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: (h - 844 * s) / 2, width: 390, height: 844, transform: `scale(${s})`, transformOrigin: '0 0', background: C.paper }}>{children}</div>
      {/* Al abrir, el icono se funde en la app; al cerrar, la vista se funde en el icono. */}
      {fade > 0 && (
        <div style={{ position: 'absolute', inset: 0, opacity: fade, display: 'grid', placeItems: 'center', background: icon ? 'transparent' : 'transparent' }}>
          <Img src={staticFile('icon.png')} style={{ width: Math.min(w, h), height: Math.min(w, h) }} />
        </div>
      )}
    </div>
  )
}

/** Captura real de la app, bajada lo justo para dejar sitio a la barra de estado (como al instalarla). */
export function AppScreen() {
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <div style={{ position: 'absolute', top: 44, left: 0, width: 390, height: 724, overflow: 'hidden' }}>
        <Img src={SHOT} style={{ width: 390, height: 844 }} />
      </div>
      <div style={{ position: 'absolute', top: 768, left: 0, width: 390, height: 76, overflow: 'hidden' }}>
        <Img src={SHOT} style={{ width: 390, height: 844, marginTop: -768 }} />
      </div>
    </AbsoluteFill>
  )
}

export const NAV = [
  ['Inicio', 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z'],
  ['Calendario', 'M4.5 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2zM4.5 10h15M8.5 3.5v3M15.5 3.5v3'],
  ['Timeline', 'M6 4v16M6 7h.01M6 12h.01M6 17h.01M10 7h9M10 12h6M10 17h8'],
  ['Documentos', 'M6.5 3.5h8l4 4v12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM14 3.5V8h4.5M8.5 12.5h7M8.5 16h5'],
  [
    'Ajustes',
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.3 1-2 3.4-1.5-.6a7 7 0 0 1-1.9 1.1L15 20h-4l-.3-1.6a7 7 0 0 1-1.9-1.1l-1.5.6-2-3.4 1.3-1a7 7 0 0 1 0-2.2l-1.3-1 2-3.4 1.5.6a7 7 0 0 1 1.9-1.1L11 4h4l.3 1.6a7 7 0 0 1 1.9 1.1l1.5-.6 2 3.4-1.3 1a7 7 0 0 1 0 2.2z',
  ],
]

/** Ajustes de la app con la tarjeta de Notificaciones; `Permission` dibuja el permiso del sistema. */
export function SettingsScreen({ f, t, Permission }) {
  const allowed = t >= 34.9
  const btnPress = pressAmount(t, 33.0)
  const alertIn = prog(f, T(33.4), T(0.35))
  const alertOut = prog(f, T(34.75), T(0.25), accel)
  const alertA = alertIn * (1 - alertOut)
  const allowPress = pressAmount(t, 34.5)
  const check = prog(f, T(34.9), T(0.4))
  return (
    <AbsoluteFill style={{ background: C.paper, color: C.ink }}>
      <div style={{ position: 'absolute', top: 64, left: 20, right: 20 }}>
        <div style={{ fontSize: 13, color: C.ink5 }}>Tema, avisos y cuenta</div>
        <div style={{ fontFamily: F.serif, fontSize: 46, lineHeight: 1, marginTop: 4, letterSpacing: '-0.01em' }}>Ajustes</div>

        <Card title="Apariencia" top={22}>
          <div style={{ display: 'flex', background: C.paper2, borderRadius: 11, padding: 3, fontSize: 13 }}>
            {['Claro', 'Oscuro', 'Sistema'].map((l, i) => (
              <div key={l} style={{ flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 9, background: i === 2 ? C.surface : 'transparent', fontWeight: i === 2 ? 600 : 400, color: i === 2 ? C.ink : C.ink5 }}>
                {l}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Notificaciones" top={14}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: allowed ? '#e3f1e8' : C.paper2, flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={allowed ? '#2f7a52' : C.ink5} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={allowed ? 'M5 12.5 10 17.5 19 7' : 'M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14zM10 20.5a2 2 0 0 0 4 0'} style={{ opacity: allowed ? check : 1 }} />
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: C.ink5 }}>
              {allowed ? 'Este dispositivo recibe avisos de tus eventos, recordatorios y sesiones de estudio.' : 'Recibe avisos de tus eventos, recordatorios y sesiones de estudio en este dispositivo.'}
            </p>
          </div>
          <div
            style={{
              marginTop: 14,
              display: 'inline-flex',
              height: 40,
              alignItems: 'center',
              padding: '0 16px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 500,
              background: allowed ? C.surface : C.ember,
              color: allowed ? C.ink : '#fff',
              boxShadow: allowed ? `0 0 0 1px ${C.paper2}` : 'none',
              transform: `scale(${1 - btnPress * 0.04})`,
            }}
          >
            {allowed ? 'Desactivar en este dispositivo' : 'Activar notificaciones'}
          </div>
        </Card>
      </div>

      {/* Barra de navegación de la app, con Ajustes activo */}
      <div style={{ position: 'absolute', left: 12, right: 12, bottom: 18, height: 62, borderRadius: 22, background: C.surface, boxShadow: '0 6px 20px -8px rgba(0,0,0,.2)', display: 'flex', padding: 4 }}>
        {NAV.map(([label, d], i) => {
          const on = i === 4
          return (
            <div key={label} style={{ flex: 1, borderRadius: 18, background: on ? C.paper2 : 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={on ? C.ember : C.ink5} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d={d} />
              </svg>
              <span style={{ fontSize: 10, color: on ? C.ink : C.ink5 }}>{label}</span>
            </div>
          )
        })}
      </div>

      {alertA > 0 && <Permission a={alertA} enter={alertIn} allowPress={allowPress} />}
    </AbsoluteFill>
  )
}

export function Card({ title, top, children }) {
  return (
    <div style={{ marginTop: top, background: C.surface, borderRadius: 18, padding: 16, boxShadow: '0 1px 2px rgba(44,36,24,.04), 0 4px 16px -6px rgba(44,36,24,.08)', border: `1px solid ${C.paper2}` }}>
      <div style={{ fontSize: 13, color: C.ink5, fontWeight: 500, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

/** 0→1→0 alrededor de una pulsación (para hundir botones y dibujar el toque). */
export function pressAmount(t, at, hold = 0.25) {
  return interpolate(t, [at - 0.1, at, at + hold, at + hold + 0.25], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
}

/** Toque táctil (como en las grabaciones de pantalla): círculo que viaja en arco y se hunde al pulsar. */
export function Finger({ t, points, show, presses }) {
  const vis = show.reduce((v, [a, z]) => Math.max(v, interpolate(t, [a, a + 0.3, z - 0.3, z], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })), 0)
  if (vis <= 0) return null
  let i = 0
  while (i + 1 < points.length && points[i + 1][0] <= t) i++
  const [, x0, y0] = points[i]
  const next = Math.min(i + 1, points.length - 1)
  const [, x1, y1] = points[next]
  // Llega a cada punto en 0.9 s con curva y un arco suave hacia arriba.
  const startMove = points[next][0] - 0.9
  const k = next === i ? 1 : interpolate(t, [startMove, points[next][0]], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: inOut })
  const x = mix(x0, x1, k)
  const y = mix(y0, y1, k) - Math.sin(Math.PI * k) * 24
  const press = Math.max(...presses.map((p) => pressAmount(t, p, 0.12)))
  const ripple = Math.max(
    ...presses.map((p) => interpolate(t, [p, p + 0.45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: out }) * (t >= p ? 1 : 0) * (t < p + 0.45 ? 1 : 0)),
  )
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, zIndex: 40, opacity: vis }}>
      {ripple > 0 && (
        <div style={{ position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: 99, border: '2px solid rgba(255,255,255,.9)', transform: `scale(${1 + ripple * 1.2})`, opacity: 1 - ripple }} />
      )}
      <div
        style={{
          position: 'absolute',
          left: -22,
          top: -22,
          width: 44,
          height: 44,
          borderRadius: 99,
          background: `rgba(${press > 0.5 ? '212,95,50' : '40,38,34'},${0.28 + press * 0.15})`,
          border: '2.5px solid rgba(255,255,255,.95)',
          boxShadow: `0 ${8 - press * 5}px ${18 - press * 8}px rgba(0,0,0,.28)`,
          transform: `scale(${1 - press * 0.18})`,
        }}
      />
    </div>
  )
}
