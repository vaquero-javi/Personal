import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, PageHeader, Segmented } from '../../components/ui'
import { Icon, type IconName } from '../../components/Icon'
import { supabase, unwrap } from '../../lib/supabase'
import { disablePush, enablePush, getCurrentSubscription, isIosBrowserTab, pushSupported } from '../../lib/push'
import { getThemePref, setThemePref, type ThemePref } from '../../lib/theme'
import { useAuth } from '../auth/AuthProvider'

const THEMES: { value: ThemePref; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Oscuro', icon: 'moon' },
  { value: 'system', label: 'Sistema', icon: 'monitor' },
]

function ThemeCard() {
  const [theme, setTheme] = useState<ThemePref>(getThemePref)
  return (
    <Card title="Apariencia">
      <Segmented
        className="w-full"
        value={theme}
        onChange={(v) => {
          setTheme(v)
          setThemePref(v)
        }}
        options={THEMES.map((t) => ({ value: t.value, label: <><Icon name={t.icon} size={15} /> {t.label}</> }))}
      />
      {theme === 'system' && <p className="mt-3 text-xs text-ink-400">Sigue el modo claro u oscuro de tu dispositivo.</p>}
    </Card>
  )
}

export function SettingsPage() {
  const { session } = useAuth()
  const qc = useQueryClient()
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: devices = [] } = useQuery({
    queryKey: ['push-devices'],
    queryFn: async () =>
      unwrap(await supabase.from('push_subscriptions').select('id, device_label, created_at').order('created_at')) as {
        id: string
        device_label: string | null
        created_at: string
      }[],
  })

  useEffect(() => {
    getCurrentSubscription().then((s) => setSubscribed(!!s)).catch(() => setSubscribed(false))
  }, [])

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (subscribed) await disablePush()
      else await enablePush()
      setSubscribed(!subscribed)
      qc.invalidateQueries({ queryKey: ['push-devices'] })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <PageHeader eyebrow="Tema, avisos y cuenta" title="Ajustes" />

      <ThemeCard />

      <Card title="Notificaciones">
        {isIosBrowserTab() ? (
          <p className="text-sm leading-relaxed text-ink-600">
            En iPhone/iPad las notificaciones solo funcionan con la app instalada: pulsa <b className="font-medium text-ink-900">Compartir → Añadir a pantalla de inicio</b>, ábrela desde ahí y vuelve a esta pantalla.
          </p>
        ) : !pushSupported() ? (
          <p className="text-sm text-ink-600">Este navegador no admite notificaciones push.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${subscribed ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-500'}`}>
                <Icon name={subscribed ? 'check' : 'bell'} size={18} />
              </span>
              <p className="text-sm leading-relaxed text-ink-600">
                {subscribed
                  ? 'Este dispositivo recibirá los avisos aunque la app esté cerrada.'
                  : 'Activa las notificaciones para recibir los avisos en este dispositivo aunque no tengas la app abierta.'}
              </p>
            </div>
            <Button onClick={toggle} disabled={busy || subscribed === null} variant={subscribed ? 'secondary' : 'accent'}>
              {busy ? 'Un momento…' : subscribed ? 'Desactivar en este dispositivo' : 'Activar notificaciones'}
            </Button>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
          </div>
        )}
        {devices.length > 0 && (
          <div className="mt-5 border-t border-ink-100 pt-4">
            <p className="mb-2 text-xs text-ink-500">Dispositivos con avisos activos</p>
            <ul className="space-y-1">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-2.5 text-sm text-ink-800">
                  <Icon name="device" size={16} className="text-ink-400" />
                  {d.device_label ?? 'Dispositivo'}
                  <span className="ml-auto font-mono text-xs text-ink-400">desde {new Date(d.created_at).toLocaleDateString('es-ES')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title="Cuenta">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-ink-900 font-display text-xl text-ink-50">
            {session?.user.email?.[0]?.toUpperCase()}
          </span>
          <p className="mr-auto min-w-0 truncate text-sm text-ink-800">{session?.user.email}</p>
          <Button variant="secondary" size="sm" onClick={() => supabase.auth.signOut().then(() => qc.clear())}>
            <Icon name="logout" size={15} /> Cerrar sesión
          </Button>
        </div>
      </Card>
    </div>
  )
}
