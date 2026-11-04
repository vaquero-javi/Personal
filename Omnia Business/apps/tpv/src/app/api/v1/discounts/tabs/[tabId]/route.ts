import { container } from '@/server/container';
import { handleShift } from '@/server/http';

/** DELETE /api/v1/discounts/tabs/:tabId — quita la tarjeta de empleado de una cuenta abierta. */
export async function DELETE(request: Request, { params }: { params: Promise<{ tabId: string }> }) {
  const { tabId } = await params;
  return handleShift(request, async (shift) => {
    await container().staffCards.removeFromTab(shift.ctx, tabId);
    return { removed: true };
  });
}
