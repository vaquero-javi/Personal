// Envía por Web Push los avisos cuyo momento ya ha llegado. La invoca pg_cron cada minuto.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const TIME_ZONE = Deno.env.get('APP_TIMEZONE') ?? 'Europe/Madrid'
// Avisos más antiguos que esto (p. ej. si el cron estuvo parado) no se envían por push;
// siguen visibles en la campana de la app.
const MAX_LATE_MS = 6 * 60 * 60 * 1000

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

type DueAlert = {
  id: string
  user_id: string
  offset_minutes: number
  fire_at: string
  events: {
    id: string
    title: string
    type: 'event' | 'reminder'
    start_at: string
    end_at: string | null
    all_day: boolean
    completed: boolean
    study_plan_id: string | null
    study_kind: string | null
  }
}

const time = (iso: string) => new Intl.DateTimeFormat('es-ES', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

/** Sesiones de un plan de estudio: «Empieza ahora · 09:00–10:30». */
function describeSession(ev: DueAlert['events'], offsetMinutes: number): string {
  const lead = offsetMinutes === 0 ? 'Empieza ahora' : offsetMinutes % 60 === 0 ? `En ${offsetMinutes / 60} h` : `En ${offsetMinutes} min`
  return `${lead} · ${time(ev.start_at)}${ev.end_at ? `–${time(ev.end_at)}` : ''}`
}

function describeWhen(ev: DueAlert['events'], offsetMinutes: number): string {
  const start = new Date(ev.start_at)
  const date = new Intl.DateTimeFormat('es-ES', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(ev.all_day ? {} : { hour: '2-digit', minute: '2-digit' }),
  }).format(start)

  let lead: string
  if (offsetMinutes === 0) lead = ev.type === 'reminder' ? 'Ahora' : 'Empieza ahora'
  else if (offsetMinutes % 1440 === 0) {
    const d = offsetMinutes / 1440
    lead = d === 1 ? 'Mañana' : d === 7 ? 'En una semana' : `En ${d} días`
  } else if (offsetMinutes % 60 === 0) {
    const h = offsetMinutes / 60
    lead = h === 1 ? 'En 1 hora' : `En ${h} horas`
  } else lead = `En ${offsetMinutes} min`

  return `${lead} · ${date}`
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date()
  // Reclamar los avisos marcándolos como enviados en la misma sentencia evita duplicados
  // si dos ejecuciones se solapan.
  const { data: alerts, error } = await supabase
    .from('event_alerts')
    .update({ sent_at: now.toISOString() })
    .lte('fire_at', now.toISOString())
    .is('sent_at', null)
    .is('dismissed_at', null)
    .select('id, user_id, offset_minutes, fire_at, events(id, title, type, start_at, end_at, all_day, completed, study_plan_id, study_kind)')
    .returns<DueAlert[]>()

  if (error) {
    console.error(error)
    return new Response(error.message, { status: 500 })
  }

  const toSend = (alerts ?? []).filter(
    (a) => !a.events.completed && now.getTime() - new Date(a.fire_at).getTime() <= MAX_LATE_MS,
  )
  if (toSend.length === 0) return Response.json({ sent: 0 })

  const userIds = [...new Set(toSend.map((a) => a.user_id))]
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)

  let sent = 0
  const expired = new Set<string>()

  await Promise.all(
    toSend.flatMap((alert) =>
      (subs ?? [])
        .filter((s) => s.user_id === alert.user_id)
        .map(async (sub) => {
          const ev = alert.events
          // Las sesiones de estudio abren su plan, donde se marcan como hechas.
          const session = ev.study_plan_id && ev.study_kind && ev.study_kind !== 'exam'
          const payload = JSON.stringify({
            title: (session ? '📚 ' : ev.type === 'reminder' ? '🔔 ' : '📅 ') + ev.title,
            body: session ? describeSession(ev, alert.offset_minutes) : describeWhen(ev, alert.offset_minutes),
            tag: alert.id,
            url: session ? `/study/${ev.study_plan_id}` : `/calendar?event=${ev.id}`,
          })
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
              { TTL: 60 * 60 },
            )
            sent++
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode
            // 404/410: el navegador anuló la suscripción.
            if (status === 404 || status === 410) expired.add(sub.id)
            else console.error('push error', status, err)
          }
        }),
    ),
  )

  if (expired.size > 0) {
    await supabase.from('push_subscriptions').delete().in('id', [...expired])
  }

  return Response.json({ alerts: toSend.length, sent, expired: expired.size })
})
