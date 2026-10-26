import { redirect } from 'next/navigation';
import { container } from '@/server/container';
import { devSignIn } from '@/server/session-actions';
import { initials } from '@/lib/format';
import { SignIn } from '@/features/auth/sign-in';

export const metadata = { title: 'Entrar · Omnia' };

/**
 * Acceso de desarrollo (AUTH_MODE=dev): elige un usuario de ejemplo. En
 * producción esta pantalla es el inicio de sesión del proveedor de identidad.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (process.env.AUTH_MODE !== 'dev') {
    const { error } = await searchParams;
    return (
      <main className="flex min-h-dvh items-start justify-center bg-carton px-4 py-12 md:items-center">
        <div className="w-full max-w-sm rounded-lg border border-shelf-edge bg-sheet">
          <div className="border-b border-line px-5 py-4">
            <h1 className="text-lg font-bold">Entrar en Omnia</h1>
            <p className="mt-1 text-sm text-ink-3">Gestión de todas tus sociedades en un solo sitio.</p>
          </div>
          <SignIn oauthError={error === 'oauth'} />
        </div>
      </main>
    );
  }
  // Consulta sin RLS: solo existe en desarrollo local, con la base embebida.
  const users = await container().sql<{ id: string; email: string; full_name: string; orgs: string[]; roles: string[] }[]>`
    select u.id, u.email, u.full_name,
           array_agg(o.trade_name order by o.legal_name) as orgs,
           array_agg(distinct r.name) as roles
    from users u
    join user_organizations uo on uo.user_id = u.id
    join organizations o on o.id = uo.organization_id
    join roles r on r.id = uo.role_id
    group by u.id order by u.full_name`.catch(() => null);
  if (!users) redirect('/entrar?error=db');

  return (
    <main className="flex min-h-dvh items-start justify-center bg-carton px-4 py-12 md:items-center">
      <div className="w-full max-w-lg rounded-lg border border-shelf-edge bg-sheet">
        <div className="border-b border-line px-5 py-4">
          <h1 className="text-lg font-bold">Entrar en Omnia</h1>
          <p className="mt-1 text-sm text-ink-3">
            Entorno de desarrollo: elige con qué persona de ejemplo quieres entrar. Cada una tiene un rol distinto en cada sociedad.
          </p>
        </div>
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <li key={u.id}>
              <form action={devSignIn}>
                <input type="hidden" name="userId" value={u.id} />
                <button type="submit" className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-sheet-head">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
                    {initials(u.full_name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{u.full_name}</span>
                    <span className="block truncate text-sm text-ink-3">
                      {u.roles.join(', ')} · {u.orgs.join(', ')}
                    </span>
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
