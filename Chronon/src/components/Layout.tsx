import { NavLink, Outlet } from 'react-router'
import { AlertsBell } from '../features/alerts/AlertsBell'
import { useEventEditor } from '../features/calendar/EventEditor'
import { Icon, Logo, type IconName } from './Icon'

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/calendar', label: 'Calendario', icon: 'calendar' },
  { to: '/timeline', label: 'Timeline', icon: 'timeline' },
  { to: '/notes', label: 'Apuntes', icon: 'notes' },
  { to: '/settings', label: 'Ajustes', icon: 'settings' },
]

export function Layout() {
  const { openNew } = useEventEditor()

  return (
    <div className="min-h-dvh md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">
        Saltar al contenido
      </a>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col px-4 py-5 md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-[0.18em]">CHRONON</span>
        </div>
        <nav className="space-y-0.5" aria-label="Principal">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-200 ${isActive ? 'bg-surface font-medium text-ink-900 shadow-soft ring-1 ring-ink-200/70' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900'}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} className={isActive ? 'text-accent-500' : ''} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => openNew({ type: 'event' })}
          className="mt-6 flex h-10 items-center justify-center gap-2 rounded-xl bg-ink-900 text-sm font-medium text-ink-50 transition-[background-color,transform] duration-200 hover:bg-ink-800 active:scale-[0.98]"
        >
          <Icon name="plus" size={16} strokeWidth={2} />
          Nuevo evento
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 bg-ink-50/80 px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur-xl md:px-8 md:pt-4 md:bg-transparent md:backdrop-blur-none">
          <div className="flex items-center gap-2 md:hidden">
            <Logo size={26} />
            <span className="text-sm font-semibold tracking-[0.18em]">CHRONON</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => openNew({ type: 'event' })}
              className="grid size-9 place-items-center rounded-xl bg-ink-900 text-ink-50 transition-transform duration-200 active:scale-95 md:hidden"
              aria-label="Nuevo evento"
            >
              <Icon name="plus" size={18} strokeWidth={2} />
            </button>
            <AlertsBell />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-2 pb-32 md:px-8 md:pb-12">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Principal"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid grid-cols-5 rounded-2xl bg-surface/90 p-1 shadow-float ring-1 ring-ink-200/70 backdrop-blur-xl md:hidden"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 rounded-xl py-2 text-[10.5px] transition-colors duration-200 ${isActive ? 'bg-ink-100 font-medium text-ink-900' : 'text-ink-500'}`
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={item.icon} size={20} className={isActive ? 'text-accent-500' : ''} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
