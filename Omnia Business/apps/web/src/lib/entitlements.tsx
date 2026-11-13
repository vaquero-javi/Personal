'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { EntitlementsResponse, featureLineage, hasFeature } from '@omnia/entitlements/contracts';

/** Lo que la interfaz necesita del catálogo (sin las reglas de permisos). */
export interface FeatureInfo {
  code: string;
  parentCode: string | null;
  name: string;
  description: string;
  isCore: boolean;
}

/** Módulos de una sociedad tal como los resolvió el servidor al pintar la página. */
export interface OrganizationEntitlements {
  id: string;
  slug: string;
  features: string[];
  /** Puede pedir a Omnia que active módulos (permiso org.manage). */
  canRequest: boolean;
  /** Módulos que Omnia le oculta: si no los tiene, no se enseñan ni con candado. */
  hidden: string[];
}

interface EntitlementsValue {
  catalog: ReadonlyMap<string, FeatureInfo>;
  /** Sociedad abierta (/o/[org]); null en /o/grupo o /o/nueva. */
  active: OrganizationEntitlements | null;
  features: ReadonlySet<string> | null;
  /** Módulos que Omnia oculta a la sociedad abierta. */
  hidden: ReadonlySet<string>;
  isLoading: boolean;
}

const EntitlementsContext = createContext<EntitlementsValue | null>(null);

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

async function fetchEntitlements(organizationId: string, signal: AbortSignal) {
  const response = await fetch('/api/v1/entitlements', {
    headers: { 'x-organization-id': organizationId },
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error(`entitlements ${response.status}`);
  return EntitlementsResponse.parse(await response.json());
}

/**
 * Módulos contratados de la sociedad abierta. Arranca con lo que resolvió el
 * servidor (sin parpadeo ni carga) y se revalida al volver a la pestaña y cada
 * minuto: si Omnia activa o quita un módulo, la barra lateral y las páginas
 * (que se deciden en el servidor) se actualizan solas con router.refresh().
 *
 * La empresa sale de la URL, como en el resto de la app: dos pestañas pueden
 * estar en sociedades distintas, y la clave de caché empieza por ['org', id].
 */
export function EntitlementsProvider({
  organizations,
  catalog,
  children,
}: {
  organizations: OrganizationEntitlements[];
  catalog: FeatureInfo[];
  children: ReactNode;
}) {
  const { org: slug } = useParams<{ org?: string }>();
  const router = useRouter();
  const active = organizations.find((o) => o.slug === slug) ?? null;

  const query = useQuery({
    queryKey: ['org', active?.id ?? 'none', 'entitlements'],
    queryFn: ({ signal }) => fetchEntitlements(active!.id, signal),
    enabled: active !== null,
    initialData: active ? { organizationId: active.id, features: active.features, hidden: active.hidden } : undefined,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const current = query.data?.organizationId === active?.id ? query.data : undefined;
  const fresh = current?.features;
  const freshHidden = current?.hidden;
  const serverSnapshot = active?.features;
  const serverHidden = active?.hidden;

  // Lo de servidor (páginas, barra lateral) va con la foto del render: si ha cambiado
  // lo contratado o lo que Omnia oculta, se repinta.
  useEffect(() => {
    if (
      (fresh && serverSnapshot && !sameList(fresh, serverSnapshot)) ||
      (freshHidden && serverHidden && !sameList(freshHidden, serverHidden))
    ) {
      router.refresh();
    }
  }, [fresh, serverSnapshot, freshHidden, serverHidden, router]);

  const value = useMemo<EntitlementsValue>(() => {
    const list = fresh ?? serverSnapshot;
    return {
      catalog: new Map(catalog.map((f) => [f.code, f])),
      active,
      features: list ? new Set(list) : null,
      hidden: new Set(freshHidden ?? serverHidden ?? []),
      isLoading: active !== null && !list && query.isPending,
    };
  }, [catalog, active, fresh, serverSnapshot, freshHidden, serverHidden, query.isPending]);

  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}

export function useEntitlements(): EntitlementsValue {
  const value = useContext(EntitlementsContext);
  if (!value) throw new Error('useEntitlements() fuera de <EntitlementsProvider>');
  return value;
}

/** ¿Omnia oculta este módulo (o el que falta de su cadena) a la sociedad abierta? */
export function useHiddenFeature(featureCode: string): boolean {
  const { hidden } = useEntitlements();
  const missing = useMissingFeature(featureCode);
  return hidden.has(featureCode) || (missing !== null && hidden.has(missing.code));
}

/** ¿La sociedad abierta tiene el módulo (y todos sus padres)? */
export function useFeature(featureCode: string): { hasAccess: boolean; isLoading: boolean } {
  const { features, isLoading } = useEntitlements();
  return { hasAccess: features !== null && hasFeature(features, featureCode), isLoading };
}

/**
 * Módulo que hay que activar para tener `featureCode`: el primero de su cadena
 * que falta (si falta «Ventas», no tiene sentido pedir solo «Tarifas»).
 */
export function useMissingFeature(featureCode: string): FeatureInfo | null {
  const { features, catalog } = useEntitlements();
  const missing = featureLineage(featureCode).find((code) => !features?.has(code)) ?? featureCode;
  return catalog.get(missing) ?? null;
}
