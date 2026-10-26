import { describe, expect, it } from 'vitest';
import { DomainError, type TenantContext } from '@omnia/core';
import { toReceiptDocument, type GoodsReceipt, type ReceiptDocument, type ReceiptLineToPost } from '../domain/goods-receipt';
import type { InventoryUnitOfWork, NewStockMovement } from './ports';
import { createGoodsReceiptService } from './goods-receipt.service';

const ORG = '00000000-0000-4000-8000-000000000001';
const OTHER_ORG = '00000000-0000-4000-8000-000000000002';
const USER = '00000000-0000-4000-8000-0000000000aa';
const RECEIPT = '00000000-0000-4000-8000-0000000000b1';
const ITEM_A = '00000000-0000-4000-8000-00000000000a';
const ITEM_B = '00000000-0000-4000-8000-00000000000b';
const WAREHOUSE = '00000000-0000-4000-8000-0000000000c1';
const SUPPLIER = '00000000-0000-4000-8000-0000000000d1';

const ctx: TenantContext = { userId: USER, organizationIds: [ORG] };

/** Unidad de trabajo en memoria: misma interfaz que la de Postgres. */
function fakeUnitOfWork(initial: { status: GoodsReceipt['status']; lines: ReceiptLineToPost[] }) {
  const state = {
    receipt: {
      id: RECEIPT,
      organizationId: ORG,
      number: 7,
      warehouseId: WAREHOUSE,
      supplierId: SUPPLIER,
      supplierDeliveryNote: 'ALB-7',
      status: initial.status,
      receivedAt: new Date('2026-10-25T08:00:00Z'),
      postedAt: null,
    } as GoodsReceipt,
    lines: initial.lines,
    movements: [] as NewStockMovement[],
    documents: [] as { receiptId: string; document: ReceiptDocument }[],
    transactions: 0,
  };

  const uow: InventoryUnitOfWork = {
    async run(_ctx, work) {
      state.transactions++;
      return work({
        receipts: {
          supplierExists: async (_org, id) => id === SUPPLIER,
          insertDraft: async () => state.receipt,
          attachDocument: async (_org, receiptId, document) => void state.documents.push({ receiptId, document }),
          lockById: async (id) => (id === state.receipt.id ? state.receipt : null),
          linesForPosting: async () => state.lines,
          markPosted: async () => {
            state.receipt = { ...state.receipt, status: 'posted', postedAt: new Date() };
            return state.receipt;
          },
        },
        stock: {
          record: async (movements) => void state.movements.push(...movements),
          levels: async (_org, warehouseId, itemIds) =>
            itemIds.map((itemId) => ({ warehouseId, itemId, onHand: '10', minQuantity: '0', belowMinimum: false })),
        },
        customFields: {
          definitions: async () => [{ key: 'pallets', dataType: 'number', isRequired: false, options: [] }],
        },
      });
    },
  };
  return { uow, state };
}

const line = (lineId: string, itemId: string): ReceiptLineToPost => ({ lineId, itemId, quantity: '5', unitCost: '1.25' });

describe('goodsReceiptService.post', () => {
  it('registra un movimiento por línea, en orden de artículo, y cierra el albarán', async () => {
    const { uow, state } = fakeUnitOfWork({ status: 'draft', lines: [line('l1', ITEM_B), line('l2', ITEM_A)] });
    const result = await createGoodsReceiptService(uow).post(ctx, RECEIPT);

    expect(result.alreadyPosted).toBe(false);
    expect(result.receipt.status).toBe('posted');
    expect(state.movements.map((m) => m.itemId)).toEqual([ITEM_A, ITEM_B]);
    expect(state.movements[0]).toMatchObject({
      movementType: 'receipt',
      quantity: '5',
      source: { type: 'goods_receipt', id: RECEIPT, lineId: 'l2' },
    });
    expect(state.transactions).toBe(1);
  });

  it('es idempotente: un reintento no vuelve a mover stock', async () => {
    const { uow, state } = fakeUnitOfWork({ status: 'posted', lines: [line('l1', ITEM_A)] });
    const result = await createGoodsReceiptService(uow).post(ctx, RECEIPT);

    expect(result.alreadyPosted).toBe(true);
    expect(state.movements).toHaveLength(0);
  });

  it('rechaza albaranes anulados o vacíos', async () => {
    const cancelled = fakeUnitOfWork({ status: 'cancelled', lines: [line('l1', ITEM_A)] });
    await expect(createGoodsReceiptService(cancelled.uow).post(ctx, RECEIPT)).rejects.toMatchObject({ code: 'INVALID_STATE' });

    const empty = fakeUnitOfWork({ status: 'draft', lines: [] });
    await expect(createGoodsReceiptService(empty.uow).post(ctx, RECEIPT)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(empty.state.movements).toHaveLength(0);
  });

  it('exige una única organización activa para escribir', async () => {
    const { uow } = fakeUnitOfWork({ status: 'draft', lines: [line('l1', ITEM_A)] });
    const consolidated: TenantContext = { userId: USER, organizationIds: [ORG, OTHER_ORG] };
    await expect(createGoodsReceiptService(uow).post(consolidated, RECEIPT)).rejects.toBeInstanceOf(DomainError);
  });
});

describe('goodsReceiptService.create', () => {
  const valid = {
    warehouseId: WAREHOUSE,
    supplierId: SUPPLIER,
    supplierDeliveryNote: ' ALB-7 ',
    lines: [{ itemId: ITEM_A, quantity: 12, unitCost: '3.50' }],
    customFields: { pallets: 2 },
  };

  it('valida la entrada con Zod y normaliza los decimales a texto', async () => {
    const { uow } = fakeUnitOfWork({ status: 'draft', lines: [] });
    await expect(createGoodsReceiptService(uow).create(ctx, valid)).resolves.toMatchObject({ number: 7 });
  });

  it('rechaza cantidades no positivas y campos personalizados desconocidos', async () => {
    const { uow } = fakeUnitOfWork({ status: 'draft', lines: [] });
    const service = createGoodsReceiptService(uow);
    await expect(service.create(ctx, { ...valid, lines: [{ itemId: ITEM_A, quantity: '0', unitCost: '1' }] })).rejects.toThrow();
    await expect(service.create(ctx, { ...valid, customFields: { color: 'rojo' } })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('rechaza un tercero que no es proveedor', async () => {
    const { uow } = fakeUnitOfWork({ status: 'draft', lines: [] });
    await expect(
      createGoodsReceiptService(uow).create(ctx, { ...valid, supplierId: '00000000-0000-4000-8000-0000000000ee' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('guarda la foto del albarán junto al registro, en la misma transacción', async () => {
    const { uow, state } = fakeUnitOfWork({ status: 'draft', lines: [] });
    const photo = toReceiptDocument('albaran.jpg', JPEG);
    await createGoodsReceiptService(uow).create(ctx, valid, photo);
    expect(state.transactions).toBe(1);
    expect(state.documents).toEqual([{ receiptId: RECEIPT, document: photo }]);
  });
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

describe('justificante del albarán', () => {
  it('reconoce el tipo por la firma del archivo, no por su nombre', () => {
    expect(toReceiptDocument('foto.png', JPEG).contentType).toBe('image/jpeg');
    expect(toReceiptDocument('a.pdf', new TextEncoder().encode('%PDF-1.7\n')).contentType).toBe('application/pdf');
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(toReceiptDocument('x', webp).contentType).toBe('image/webp');
  });

  it('rechaza archivos vacíos, demasiado grandes o que no son imagen ni PDF', () => {
    expect(() => toReceiptDocument('a.jpg', new Uint8Array())).toThrow(DomainError);
    expect(() => toReceiptDocument('a.jpg', new Uint8Array(7 * 1024 * 1024 + 1).fill(0xff))).toThrow(/7 MB/);
    expect(() => toReceiptDocument('a.html', new TextEncoder().encode('<html>'))).toThrow(/JPG, PNG, WebP, GIF o PDF/);
  });

  it('limpia el nombre del archivo', () => {
    expect(toReceiptDocument('../../etc/al\u0000b.jpg', JPEG).fileName).toBe('....etcalb.jpg');
    expect(toReceiptDocument('  ', JPEG).fileName).toBe('albaran');
  });
});
