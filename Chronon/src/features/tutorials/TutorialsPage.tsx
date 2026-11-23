import { PageHeader } from '../../components/ui'
import { Icon } from '../../components/Icon'

/** Vídeos de public/videos (se generan en trailer/: npm run render:tutorial y render:tutorial-android). */
const TUTORIALS = [
  {
    id: 'ios',
    title: 'Instalar en iPhone o iPad',
    summary: 'Safari → Compartir → Añadir a pantalla de inicio. Y cómo activar los avisos.',
    video: '/videos/instalar-ios.mp4',
    poster: '/videos/instalar-ios.jpg',
    duration: '41 s',
  },
  {
    id: 'android',
    title: 'Instalar en Android',
    summary: 'Chrome → menú ⋮ → Instalar aplicación. Y cómo activar los avisos.',
    video: '/videos/instalar-android.mp4',
    poster: '/videos/instalar-android.jpg',
    duration: '41 s',
  },
] as const

type Platform = (typeof TUTORIALS)[number]['id'] | null

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  // iPadOS se presenta como Mac, pero con pantalla táctil.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return null
}

const installed = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export function TutorialsPage() {
  const platform = detectPlatform()
  // El de tu dispositivo, primero.
  const list = [...TUTORIALS].sort((a, b) => Number(b.id === platform) - Number(a.id === platform))

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Aprende a sacarle partido" title="Tutoriales" />

      {installed() && (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <Icon name="check" size={16} /> Ya estás usando CHRONOS como app en este dispositivo.
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {list.map((t) => (
          <li key={t.id} className="animate-rise space-y-4 rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-ink-200/70 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="flex flex-wrap items-center gap-2 text-base font-medium text-ink-900">
                  {t.title}
                  {t.id === platform && <span className="rounded-md bg-accent-50 px-1.5 py-0.5 text-[11px] font-medium text-accent-700">Tu dispositivo</span>}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-500">{t.summary}</p>
              </div>
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-400">{t.duration}</span>
            </div>
            <video
              className="mx-auto block aspect-[9/16] w-full max-w-[340px] rounded-2xl bg-ink-100 object-cover"
              src={t.video}
              poster={t.poster}
              controls
              playsInline
              preload="none"
            >
              Tu navegador no puede reproducir este vídeo.
            </video>
          </li>
        ))}
      </ul>
    </div>
  )
}
