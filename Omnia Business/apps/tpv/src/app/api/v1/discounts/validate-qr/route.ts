import { container } from '@/server/container';
import { handleShift, readJson } from '@/server/http';

/**
 * POST /api/v1/discounts/validate-qr — el TPV ha leído el QR de una tarjeta de empleado.
 *
 *   { "tabId": "<uuid>", "qr": "OMN1:<tarjeta>:<código>", "pin": "1234"? }
 *
 * 200 { status: "applied", holder, discount: { percent, scope: "tab" }, limits, alreadyApplied }
 * 200 { status: "pin_required", holder }      → pedir el PIN al titular y repetir con `pin`
 * 4xx application/problem+json con `reason`: QR_FORMAT, CARD_UNKNOWN, CARD_INVALID, CARD_REVOKED,
 *     HOLDER_INACTIVE, NO_POLICY, PIN_WRONG, PIN_LOCKED, SELF_SERVICE, CODE_REUSED,
 *     DAILY_LIMIT, MONTHLY_LIMIT, TAB_HAS_CARD
 *
 * El porcentaje nunca viene del cliente: lo fija la política del rol del titular.
 */
export async function POST(request: Request) {
  const body = await readJson(request).catch(() => undefined);
  return handleShift(request, (shift, terminal) => container().staffCards.validateQr(shift.ctx, terminal, body));
}
