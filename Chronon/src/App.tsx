import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { Icon, Logo } from './components/Icon'
import { Layout } from './components/Layout'
import { useAuth } from './features/auth/AuthProvider'
import { LoginPage } from './features/auth/LoginPage'
import { EventEditorProvider } from './features/calendar/EventEditor'
import { HomePage } from './features/dashboard/HomePage'
import { SettingsPage } from './features/settings/SettingsPage'
import { isConfigured } from './lib/supabase'

const CalendarPage = lazy(() => import('./features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })))
const TimelinePage = lazy(() => import('./features/timeline/TimelinePage').then((m) => ({ default: m.TimelinePage })))
const NotesPage = lazy(() => import('./features/notes/NotesPage').then((m) => ({ default: m.NotesPage })))

export function App() {
  const { session, loading } = useAuth()

  if (!isConfigured) {
    return (
      <div className="min-h-dvh grid place-items-center p-6">
        <div className="max-w-md space-y-3">
          <Logo size={36} />
          <h1 className="font-display text-4xl leading-none tracking-tight">Falta configurar Supabase</h1>
          <p className="text-sm leading-relaxed text-ink-600">
            Copia <code>.env.example</code> a <code>.env.local</code>, rellena la URL y la anon key de tu proyecto y reinicia <code>npm run dev</code>.
          </p>
        </div>
      </div>
    )
  }
  if (loading)
    return (
      <div className="min-h-dvh grid place-items-center" role="status" aria-label="Cargando">
        <div className="animate-shimmer">
          <Logo size={40} />
        </div>
      </div>
    )
  if (!session) return <LoginPage />

  return (
    <BrowserRouter>
      <EventEditorProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="calendar" element={<Suspense fallback={null}><CalendarPage /></Suspense>} />
            <Route path="timeline" element={<Suspense fallback={null}><TimelinePage /></Suspense>} />
            <Route path="notes/:sectionId?/:noteId?" element={<Suspense fallback={null}><NotesPage /></Suspense>} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </EventEditorProvider>
    </BrowserRouter>
  )
}

function NotFound() {
  return (
    <div className="grid min-h-[60dvh] place-items-center text-center">
      <div className="space-y-3">
        <p className="font-mono text-sm text-ink-400">404</p>
        <h1 className="font-display text-5xl leading-none tracking-tight">Aquí no hay nada</h1>
        <p className="text-sm text-ink-500">Esta página no existe o se ha movido.</p>
        <Link to="/" className="inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-accent-600 hover:underline">
          <Icon name="back" size={16} /> Volver al inicio
        </Link>
      </div>
    </div>
  )
}
