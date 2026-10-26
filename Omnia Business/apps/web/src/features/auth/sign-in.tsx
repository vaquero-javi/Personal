'use client';

import { useState } from 'react';
import { ActionForm, Notice, TextField } from '@/components/ui/form';
import { SubmitButton, buttonClass } from '@/components/ui/button';
import { googleSignIn, passwordSignIn, passwordSignUp } from '@/server/session-actions';

/** Acceso con Supabase Auth: email y contraseña, alta de cuenta o Google. */
export function SignIn({ oauthError }: { oauthError: boolean }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      {oauthError && <Notice tone="danger">No se pudo completar el acceso con Google. Inténtalo de nuevo.</Notice>}
      <form action={googleSignIn}>
        <button type="submit" className={buttonClass('secondary', 'h-10 w-full')}>
          <svg aria-hidden viewBox="0 0 24 24" className="size-4">
            <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8Z" />
            <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23Z" />
            <path fill="#FBBC05" d="M5.8 14a6.6 6.6 0 0 1 0-4.1V7H2.1a11 11 0 0 0 0 9.9L5.8 14Z" />
            <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4Z" />
          </svg>
          Continuar con Google
        </button>
      </form>
      <p className="flex items-center gap-3 text-xs text-ink-3">
        <span className="h-px flex-1 bg-line" /> o con tu email <span className="h-px flex-1 bg-line" />
      </p>
      {mode === 'in' ? (
        <ActionForm action={passwordSignIn} className="flex flex-col gap-3">
          <TextField label="Email" name="email" type="email" autoComplete="email" required />
          <TextField label="Contraseña" name="password" type="password" autoComplete="current-password" required />
          <SubmitButton className="h-10" pendingLabel="Entrando…">Entrar</SubmitButton>
        </ActionForm>
      ) : (
        <ActionForm action={passwordSignUp} className="flex flex-col gap-3">
          <TextField label="Nombre y apellidos" name="fullName" autoComplete="name" required />
          <TextField label="Email" name="email" type="email" autoComplete="email" required />
          <TextField label="Contraseña" name="password" type="password" autoComplete="new-password" required hint="Mínimo 8 caracteres" />
          <SubmitButton className="h-10" pendingLabel="Creando cuenta…">Crear cuenta</SubmitButton>
        </ActionForm>
      )}
      <p className="text-center text-sm text-ink-2">
        {mode === 'in' ? '¿Aún no tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
        <button type="button" onClick={() => setMode(mode === 'in' ? 'up' : 'in')} className="font-semibold text-ink underline underline-offset-2">
          {mode === 'in' ? 'Créala' : 'Entra'}
        </button>
      </p>
    </div>
  );
}
