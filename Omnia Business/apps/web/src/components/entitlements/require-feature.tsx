import 'server-only';
import type { ReactNode } from 'react';
import { featureLineage } from '@omnia/entitlements';
import { requireOrg } from '@/server/session';
import type { WebFeature } from '@/server/features';
import { ModuleLocked } from './module-locked';
import { ModuleUnavailable } from './module-unavailable';

/**
 * Protección de rutas: se pone en el layout de cada módulo o submódulo. Si la
 * sociedad no lo tiene contratado, quien entra por URL directa ve la pantalla de
 * «módulo no contratado» (con la solicitud de activación) en lugar de la página.
 * Se comprueba antes que el rol: primero lo que la sociedad tiene, luego lo que
 * cada persona puede hacer dentro.
 */
export async function RequireFeature({ org, feature, children }: { org: string; feature: WebFeature; children: ReactNode }) {
  const { has, hidden, catalog, roleCan, org: membership } = await requireOrg(org);
  if (has(feature)) return children;

  const byCode = new Map(catalog.map((f) => [f.code, f]));
  const missingCode = featureLineage(feature).find((code) => !has(code)) ?? feature;
  const missing = byCode.get(missingCode);
  const requested = byCode.get(feature);
  if (!missing) throw new Error(`Módulo desconocido: ${feature}`);
  // Oculto por Omnia: no se ofrece ni se puede pedir; solo un aviso neutro (p. ej. desde un enlace guardado).
  if (hidden(feature) || hidden(missing.code)) return <ModuleUnavailable home={has('base') ? `/o/${org}` : null} />;

  return (
    <ModuleLocked
      organizationId={membership.organizationId}
      feature={{ code: missing.code, name: missing.name, description: missing.description }}
      requested={requested && requested.code !== missing.code ? { code: requested.code, name: requested.name, description: requested.description } : undefined}
      canRequest={roleCan('org.manage')}
    />
  );
}
