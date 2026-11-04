import { z } from 'zod';

/** Contratos de entrada (validados en la frontera) y de salida del módulo. */

export const IssueCardInput = z.object({
  userId: z.uuid(),
  wallet: z.enum(['apple', 'google']),
});

export const RevokeCardInput = z.object({
  reason: z.string().trim().min(3).max(200),
});

const pct = z.coerce.number().gt(0).max(100).transform((n) => n.toFixed(2));

export const PolicyInput = z.object({
  /** null = política general de la empresa. */
  roleId: z.uuid().nullable(),
  discountPct: pct,
  maxUsesPerDay: z.coerce.number().int().min(1).max(50).nullable(),
  monthlyDiscountCap: z.coerce.number().gt(0).max(100_000).transform((n) => n.toFixed(2)).nullable(),
  requirePin: z.boolean().default(true),
  allowSelfService: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type PolicyInput = z.output<typeof PolicyInput>;

/** POST /api/v1/discounts/validate-qr (TPV). */
export const ValidateQrInput = z.object({
  tabId: z.uuid(),
  qr: z.string().trim().min(10).max(200),
  /** PIN del titular, si la política lo pide (4–6 cifras). */
  pin: z.string().regex(/^\d{4,6}$/).optional(),
});
export type ValidateQrInput = z.output<typeof ValidateQrInput>;

export type ValidateQrResponse =
  | {
      status: 'applied';
      holder: { name: string; role: string };
      discount: { percent: string; scope: 'tab' };
      limits: { usesToday: number; maxUsesPerDay: number | null; discountThisMonth: string; monthlyCap: string | null };
      alreadyApplied: boolean;
    }
  | {
      /** La tarjeta es buena pero falta el PIN: el TPV lo pide al titular y repite con `pin`. */
      status: 'pin_required';
      holder: { name: string; role: string };
    };

/** Motivos de rechazo estables (van en `details.reason` del problem+json). */
export type RejectReason =
  | 'QR_FORMAT' | 'CARD_UNKNOWN' | 'CARD_INVALID' | 'CARD_REVOKED' | 'HOLDER_INACTIVE' | 'NO_POLICY'
  | 'PIN_REQUIRED' | 'PIN_WRONG' | 'PIN_LOCKED' | 'SELF_SERVICE' | 'CODE_REUSED'
  | 'DAILY_LIMIT' | 'MONTHLY_LIMIT' | 'TAB_HAS_CARD';

export interface StaffCardSummary {
  id: string;
  userId: string;
  holderName: string;
  wallet: 'apple' | 'google';
  status: 'active' | 'revoked';
  version: number;
  issuedAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
}
