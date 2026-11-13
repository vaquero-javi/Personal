import 'server-only';
import type { ReactNode } from 'react';
import { featureLineage } from '@omnia/entitlements';
import { requireOrg } from '@/server/session';
import type { WebFeature } from '@/server/features';
import { ModuleLocked } from './module-locked';

/**
 * Protección de rutas: se pone en el layout de cada módulo o submódulo. Si la
 * sociedad no lo tiene contratado, quien entra por URL directa ve la pantalla de
 * «módulo no contratado» (con la solicitud de activación) en lugar de la página.
 * Se comprueba antes que el rol: primero lo que la sociedad tiene, luego lo que
 * cada persona puede hacer dentro.
 */
export async function RequireFeature({ org, feature, children }: { org: string; feature: WebFeature; children: ReactNode }) {
  const { has, catalog, roleCan, org: membership } = await requireOrg(org);
  if (has(feature)) return children;

  const byCode = new Map(catalog.map((f) => [f.code, f]));
  const missingCode = featureLineage(feature).find((code) => !has(code)) ?? feature;
  const missing = byCode.get(missingCode);
  const requested = byCode.get(feature);
  if (!missing) throw new Error(`Módulo desconocido: ${feature}`);

  return (
    <ModuleLocked
      organizationId={membership.organizationId}
      feature={{ code: missing.code, name: missing.name, description: missing.description }}
      requested={requested && requested.code !== missing.code ? { code: requested.code, name: requested.name, description: requested.description } : undefined}
      canRequest={roleCan('org.manage')}
    />
  );
}
