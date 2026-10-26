'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { GoodsReceipt, PostGoodsReceiptResult, type CreateGoodsReceiptInput } from '@omnia/inventory/contracts';
import { apiRequest } from '@/lib/api-client';
import { useSession } from '@/lib/session';

/**
 * Claves de caché SIEMPRE prefijadas por organización: al cambiar de empresa,
 * TanStack Query nunca sirve datos de la anterior.
 */
export const inventoryKeys = {
  all: (orgId: string) => ['org', orgId, 'inventory'] as const,
  receipts: (orgId: string) => [...inventoryKeys.all(orgId), 'goods-receipts'] as const,
  receipt: (orgId: string, id: string) => [...inventoryKeys.receipts(orgId), id] as const,
  stockLevels: (orgId: string) => [...inventoryKeys.all(orgId), 'stock-levels'] as const,
};

/** Entrada del formulario (z.input): admite cantidades como number; el servidor las normaliza. */
type CreateGoodsReceiptForm = z.input<typeof CreateGoodsReceiptInput>;

export function useCreateGoodsReceipt() {
  const session = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateGoodsReceiptForm) =>
      apiRequest(session, '/goods-receipts', GoodsReceipt, { method: 'POST', body: input }),
    onSuccess: (receipt) => {
      queryClient.setQueryData(inventoryKeys.receipt(session.organizationId, receipt.id), receipt);
      return queryClient.invalidateQueries({ queryKey: inventoryKeys.receipts(session.organizationId) });
    },
  });
}

export function usePostGoodsReceipt() {
  const session = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (receiptId: string) =>
      apiRequest(session, `/goods-receipts/${receiptId}/post`, PostGoodsReceiptResult, { method: 'POST' }),
    // Seguro de reintentar: el endpoint es idempotente (útil con cobertura móvil irregular en almacén).
    retry: (failureCount, error) => failureCount < 3 && !('status' in error && Number(error.status) < 500),
    onSuccess: ({ receipt }) => {
      const orgId = session.organizationId;
      queryClient.setQueryData(inventoryKeys.receipt(orgId, receipt.id), receipt);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: inventoryKeys.receipts(orgId) }),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.stockLevels(orgId) }),
      ]);
    },
  });
}
