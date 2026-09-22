import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { Button, Field, inputClass } from '../../components/ui'
import { Logo } from '../../components/Icon'

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)

  // Al volver de Google, Supabase puede devolver el fallo en la propia URL:
  // sin esto la app se limitaría a repintar el login sin explicar nada.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const query = new URLSearchParams(window.location.search)
    const code = hash.get('error') ?? query.get('error')
    const description = hash.get('error_description') ?? query.get('error_description')
    if (!code && !description) return
    setError(description ?? code)
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  async function signInWithGoogle() {
    setGoogleBusy(true)
    setError(null)
    // Redirige a Google, que ofrece las cuentas ya abiertas en el dispositivo, y vuelve aquí con la sesión.
    // Si la cuenta no existe todavía, Supabase la crea en ese momento.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
    })
    if (error) {
      setError(error.message)
      setGoogleBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    const { data, error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) setError(error.message)
    else if (mode === 'signup' && !data.session) setInfo('Revisa tu correo para confirmar la cuenta.')
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* Esferas concéntricas de fondo: la marca a escala de página. */}
      <svg className="pointer-events-none absolute -right-48 -top-48 size-[640px] text-ink-200 sm:-right-24" viewBox="0 0 640 640" aria-hidden>
        {[310, 250, 190, 130].map((r) => (
          <circle key={r} cx="320" cy="320" r={r} fill="none" stroke="currentColor" strokeWidth="1" />
        ))}
        <path d="M320 320V120M320 320l140 90" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="320" cy="320" r="7" className="fill-accent-500" />
      </svg>

      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col justify-center px-6 py-12 sm:px-10">
        <div className="mb-8">
          <Logo size={104} />
        </div>

        <div className="max-w-sm animate-rise">
          <h1 className="font-display text-5xl leading-[0.95] tracking-tight sm:text-6xl">
            {mode === 'login' ? (
              <>
                Tu tiempo,
                <br />
                <em className="text-accent-500">en orden.</em>
              </>
            ) : (
              <>
                Empieza a
                <br />
                <em className="text-accent-500">contar.</em>
              </>
            )}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-500">Calendario, avisos y apuntes en un solo sitio.</p>

          {error && (
            <p className="mt-6 rounded-xl bg-red-50 px-3 py-2.5 text-sm leading-relaxed text-red-700" role="alert">
              {error}
            </p>
          )}
          {info && <p className="mt-6 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{info}</p>}

          <Button type="button" variant="secondary" className={`w-full ${error || info ? 'mt-4' : 'mt-8'}`} onClick={signInWithGoogle} disabled={googleBusy}>
            <GoogleLogo />
            {googleBusy ? 'Abriendo Google…' : 'Continuar con Google'}
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs text-ink-400">
            <span className="h-px flex-1 bg-ink-200" />o con tu email<span className="h-px flex-1 bg-ink-200" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="Email">
              <input className={inputClass} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Contraseña">
              <input
                className={inputClass}
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </Button>
          </form>
          <p className="mt-5 text-sm text-ink-500">
            {mode === 'login' ? '¿Primera vez? ' : '¿Ya tienes cuenta? '}
            <button
              type="button"
              className="font-medium text-ink-900 underline decoration-ink-300 underline-offset-4 transition-colors hover:decoration-accent-500"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            >
              {mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
