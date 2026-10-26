'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface Session {
  /** Organización activa. Viene de la URL (/o/[org]/…), no de estado global: cada pestaña puede estar en una empresa. */
  organizationId: string;
  /** Lo implementa el adaptador de identidad (p. ej. `supabase.auth.getSession()`), que también refresca el token. */
  getAccessToken: () => Promise<string>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ value, children }: { value: Session; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession() fuera de <SessionProvider>');
  return session;
}
