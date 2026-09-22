import { supabase, unwrap } from './supabase'

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** iOS solo permite push si la app está instalada en la pantalla de inicio. */
export const isIosBrowserTab = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) &&
  !window.matchMedia('(display-mode: standalone)').matches

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function getCurrentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

function deviceLabel() {
  const ua = navigator.userAgent
  if (/iphone/i.test(ua)) return 'iPhone'
  if (/ipad/i.test(ua)) return 'iPad'
  if (/android/i.test(ua)) return 'Android'
  if (/mac/i.test(ua)) return 'Mac'
  if (/windows/i.test(ua)) return 'Windows'
  return 'Navegador'
}

/** Pide permiso (debe llamarse desde un clic) y guarda la suscripción de este dispositivo. */
export async function enablePush() {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) throw new Error('Falta VITE_VAPID_PUBLIC_KEY en el .env')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Has bloqueado las notificaciones para esta web')

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) }))

  const json = sub.toJSON()
  unwrap(
    await supabase.from('push_subscriptions').upsert(
      { endpoint: sub.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth, device_label: deviceLabel() },
      { onConflict: 'endpoint' },
    ),
  )
}

export async function disablePush() {
  const sub = await getCurrentSubscription()
  if (!sub) return
  unwrap(await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint))
  await sub.unsubscribe()
}
