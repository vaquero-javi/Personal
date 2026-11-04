import 'server-only';
import { createSql, type Sql } from '@omnia/db';
import { createOrganizationsService } from '@omnia/organizations';
import { createPosService } from '@omnia/pos';
import { createRecipeService } from '@omnia/recipes';
import { createSecretBox, createStaffCardService, type StaffCardService } from '@omnia/staff-cards';

// El pool se guarda en globalThis para no abrir uno nuevo en cada recarga de
// `next dev`; los servicios se recrean con el módulo para no quedarse con
// código viejo tras editar un paquete.
const globalForSql = globalThis as unknown as { omniaTpvSql?: Sql };

function build() {
  const sql = (globalForSql.omniaTpvSql ??= createSql());
  const pos = createPosService(sql);
  let staffCards: StaffCardService | undefined;
  return {
    sql,
    organizations: createOrganizationsService(sql),
    pos,
    recipes: createRecipeService(sql),
    /** El TPV solo valida tarjetas: no genera pases (ni necesita certificados de Apple/Google). */
    get staffCards(): StaffCardService {
      return (staffCards ??= createStaffCardService(sql, {
        box: createSecretBox(),
        verifyHolderPin: (token, userId, pin) => pos.verifyPin(token, userId, pin),
      }));
    },
  };
}

let services: ReturnType<typeof build> | undefined;

export function container() {
  return (services ??= build());
}
