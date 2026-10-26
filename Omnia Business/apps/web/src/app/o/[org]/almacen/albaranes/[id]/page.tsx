import Link from 'next/link';
import { Download } from 'lucide-react';
import { Cell, Facts, PageHeader, Ruled, StatusBadge } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, Notice } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/button-styles';
import { formatBytes, formatDateTime, formatEuro, formatQty } from '@/lib/format';
import { receiptStatus } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { cancelReceipt, postReceipt } from '../../actions';

export default async function ReceiptPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const { ctx, can } = await requireOrg(org);
  const receipt = await container().warehouse.receipt(ctx, id);
  const number = String(receipt.number).padStart(5, '0');
  const photo = `/o/${org}/almacen/albaranes/${receipt.id}/foto`;
  const doc = receipt.document;

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">Albarán {number} <StatusBadge map={receiptStatus} value={receipt.status} /></span>}
        description={`${receipt.supplierName} · nº proveedor ${receipt.supplierDeliveryNote}`}
        back={{ href: `/o/${org}/almacen/albaranes`, label: 'Entradas' }}
      />
      <Ruled cols="lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell title="Líneas">
          <Table minWidth={560}>
            <thead>
              <tr>
                <Th>Artículo</Th>
                <Th align="right">Cantidad</Th>
                <Th align="right">Coste ud.</Th>
                <Th align="right">Importe</Th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((l) => (
                <Tr key={l.id}>
                  <Td>
                    <Link href={`/o/${org}/almacen/articulos/${l.itemId}`} className="font-medium underline-offset-2 hover:underline">{l.itemName}</Link>
                    <span className="block text-xs text-ink-3">{l.sku}</span>
                  </Td>
                  <Td align="right">{formatQty(l.quantity)} <span className="text-ink-3">{l.unitOfMeasure}</span></Td>
                  <Td align="right">{formatEuro(l.unitCost)}</Td>
                  <Td align="right">{formatEuro(Number(l.quantity) * Number(l.unitCost))}</Td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="px-2 py-2.5 pl-4 text-right font-semibold md:pl-5">Total coste</td>
                <td className="px-2 py-2.5 pr-4 text-right font-bold md:pr-5">{formatEuro(receipt.totalCost)}</td>
              </tr>
            </tfoot>
          </Table>
        </Cell>
        <Cell title="Datos">
          <Facts
            items={[
              ['Proveedor', receipt.supplierName],
              ['Almacén', receipt.warehouseName],
              ['Recibido', formatDateTime(receipt.receivedAt)],
              ['Pedido de compra', receipt.purchaseOrderNumber ? `Nº ${receipt.purchaseOrderNumber}` : null],
              ['Contabilizado', receipt.postedAt ? `${formatDateTime(receipt.postedAt)} · ${receipt.postedByName}` : null],
              ['Notas', receipt.notes],
            ]}
          />
          {receipt.status === 'draft' && (
            <div className="mt-5 border-t border-line pt-4">
              {can('inventory.post') ? (
                <>
                  <p className="mb-3 text-sm text-ink-2">Al contabilizar, la mercancía entra en stock y el albarán ya no se puede editar.</p>
                  <div className="flex flex-wrap items-start gap-2">
                    <ActionForm action={postReceipt.bind(null, org, receipt.id)}>
                      <SubmitButton pendingLabel="Contabilizando…">Contabilizar entrada</SubmitButton>
                    </ActionForm>
                    <ActionForm action={cancelReceipt.bind(null, org, receipt.id)}>
                      <SubmitButton variant="danger" pendingLabel="Anulando…">Anular</SubmitButton>
                    </ActionForm>
                  </div>
                </>
              ) : (
                <Notice tone="warning">Pendiente de que alguien con permiso de almacén lo contabilice.</Notice>
              )}
            </div>
          )}
        </Cell>
      </Ruled>

      {doc && (
        <Ruled cols="">
          <Cell
            title="Albarán en papel"
            actions={
              <>
                <a href={photo} target="_blank" rel="noreferrer" className={buttonClass('secondary')}>
                  Abrir
                </a>
                <a href={`${photo}?descargar=1`} download className={buttonClass('secondary')}>
                  <Download aria-hidden className="size-4" />
                  Descargar
                </a>
              </>
            }
          >
            <p className="mb-3 text-sm text-ink-2">
              {doc.fileName} · {formatBytes(doc.byteSize)}
            </p>
            {doc.contentType === 'application/pdf' ? (
              <div className="hidden bg-sheet-head p-4 md:block md:p-6">
                <iframe src={`${photo}#toolbar=0&navpanes=0&view=FitH`} title={`Albarán ${receipt.supplierDeliveryNote} en papel`} className="mx-auto block aspect-[210/297] w-full max-w-[794px] border border-line bg-sheet" />
              </div>
            ) : (
              <a href={photo} target="_blank" rel="noreferrer" className="block bg-sheet-head p-4 md:p-6">
                {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por la propia app */}
                <img src={photo} alt={`Albarán ${receipt.supplierDeliveryNote} de ${receipt.supplierName}`} className="mx-auto max-h-[80vh] w-auto max-w-full border border-line bg-sheet object-contain" />
              </a>
            )}
          </Cell>
        </Ruled>
      )}
    </>
  );
}
