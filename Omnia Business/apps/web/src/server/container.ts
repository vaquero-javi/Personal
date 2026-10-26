import 'server-only';
import { authConfigFromEnv, createAccessTokenVerifier } from '@omnia/auth';
import { createSql, type Sql } from '@omnia/db';
import { createHrService, createPayrollService } from '@omnia/hr';
import { createIncidentsService } from '@omnia/incidents';
import { createGoodsReceiptService, createPostgresInventoryUnitOfWork, createWarehouseService } from '@omnia/inventory';
import { createInvoicingService } from '@omnia/invoicing';
import { createOrganizationsService } from '@omnia/organizations';
import { createPartiesService } from '@omnia/parties';
import { createPurchasingService } from '@omnia/purchasing';
import { createSalesService } from '@omnia/sales';

// Composición de dependencias (único sitio que conoce las implementaciones).
// Se cachea en globalThis para no abrir un pool nuevo en cada recarga de `next dev`.
function build() {
  const sql: Sql = createSql();
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
  };
}

const globalForContainer = globalThis as unknown as { omniaContainer?: ReturnType<typeof build> };

export function container() {
  return (globalForContainer.omniaContainer ??= build());
}

export type Container = ReturnType<typeof build>;
