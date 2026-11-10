import Link from 'next/link';
import { container } from '@/server/container';
import { requireShift } from '@/server/session';
import { CashReport } from '@/features/cash/cash-report';
import { Notice } from '@/components/ui';
import { buttonClass } from '@/components/button-styles';
import { PrintButton } from '@/features/cash/print-button';

export const metadata = { title: 'Reporte de caja · Omnia TPV' };

export default async function CashReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, can } = await requireShift();
  if (!can('pos.manage')) return <div className="p-6"><Notice tone="warning">El reporte de caja lo ve un encargado.</Notice></div>;
  const [session, movements] = await Promise.all([container().pos.cashReport(ctx, id), container().pos.cashMovements(ctx, id)]);
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 print:overflow-visible print:p-0">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="no-print flex gap-3">
          <Link href="/caja" className={buttonClass('primary', 'lg')}>Volver a caja</Link>
          <PrintButton />
        </div>
        <CashReport session={session} movements={movements} />
      </div>
    </div>
  );
}
