'use client';

import { useActionState } from 'react';
import { buttonClass } from '@/components/button-styles';
import { Notice, inputClass } from '@/components/ui';
import { passwordSignIn, type SignInState } from '@/server/actions';

/** Email y contraseña del equipo (no son las cuentas de las sociedades). */
export function SignIn() {
  const [state, action, pending] = useActionState<SignInState, FormData>(passwordSignIn, {});
  return (
    <form action={action} className="flex flex-col gap-3 p-5">
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
        Email
        <input name="email" type="email" autoComplete="username" required autoFocus className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
        Contraseña
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass('primary', 'mt-1 h-10')}>
        {pending ? 'Comprobando…' : 'Entrar'}
      </button>
    </form>
  );
}
