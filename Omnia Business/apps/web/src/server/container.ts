import 'server-only';
import { authConfigFromEnv, createAccessTokenVerifier } from '@omnia/auth';
import { createSql, type Sql } from '@omnia/db';
import { createHrService, createPayrollService } from '@omnia/hr';
import { createIncidentsService } from '@omnia/incidents';
import { createGoodsReceiptService, createPostgresInventoryUnitOfWork, createWarehouseService } from '@omnia/inventory';
import { createInvoicingService } from '@omnia/invoicing';
import { createOrganizationsService } from '@omnia/organizations';
import { createPartiesService } from '@omnia/parties';
import { createPosService } from '@omnia/pos';
import { createPurchasingService } from '@omnia/purchasing';
import { createRecipeService } from '@omnia/recipes';
import { createSalesService } from '@omnia/sales';
import { createStatsService } from '@omnia/stats';
import { createTasksService } from '@omnia/tasks';
import {
  appleConfigFromEnv,
  createGoogleWalletClient,
  createSecretBox,
  createStaffCardService,
  googleConfigFromEnv,
  type StaffCardService,
} from '@omnia/staff-cards';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Composición de dependencias (único sitio que conoce las implementaciones).
// El pool se cachea en globalThis para no abrir uno nuevo en cada recarga de
// `next dev`; los servicios se recrean con el módulo, así que editar un paquete
// no deja código viejo en memoria.
const globalForSql = globalThis as unknown as { omniaSql?: Sql };

function build() {
  const sql: Sql = (globalForSql.omniaSql ??= createSql());
  return {
    sql,
    verifyAccessToken: process.env.AUTH_MODE === 'dev' ? null : createAccessTokenVerifier(authConfigFromEnv()),
    organizations: createOrganizationsService(sql),
    parties: createPartiesService(sql),
    warehouse: createWarehouseService(sql),
    goodsReceipts: createGoodsReceiptService(createPostgresInventoryUnitOfWork(sql)),
    purchasing: createPurchasingService(sql),
    sales: createSalesService(sql),
    invoicing: createInvoicingService(sql),
    hr: createHrService(sql),
    payroll: createPayrollService(sql),
    incidents: createIncidentsService(sql),
    tasks: createTasksService(sql),
    stats: createStatsService(sql),
    pos: createPosService(sql),
    recipes: createRecipeService(sql),
    /** Tarjetas de empleado: perezoso, solo exige STAFF_CARD_SECRET_KEY al usarse. */
    get staffCards(): StaffCardService {
      return (staffCards ??= buildStaffCards(sql));
    },
  };
}

let staffCards: StaffCardService | undefined;

function buildStaffCards(sql: Sql): StaffCardService {
  const apple = appleConfigFromEnv();
  const google = googleConfigFromEnv();
  const logo = readFileSync(join(process.cwd(), 'public/brand/logo.png'));
  return createStaffCardService(sql, {
    box: createSecretBox(),
    // El backoffice no valida QR (eso es del TPV, que comprueba el PIN en su terminal).
    verifyHolderPin: async () => ({ ok: false, reason: 'no_pin' }),
    apple: apple ? { config: apple, images: { 'icon.png': logo, 'icon@2x.png': logo, 'logo.png': logo, 'logo@2x.png': logo } } : null,
    google: google ? { config: google, client: createGoogleWalletClient(google) } : null,
  });
}

let services: ReturnType<typeof build> | undefined;

export function container() {
  return (services ??= build());
}

export type Container = ReturnType<typeof build>;
