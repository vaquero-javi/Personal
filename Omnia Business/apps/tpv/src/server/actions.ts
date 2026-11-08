'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DomainError } from '@omnia/core';
import type { CheckoutResult } from '@omnia/pos';
import type { ClockEntryType, ClockLookup } from '@omnia/staff-cards';
import { container } from './container';
import { run, type Result } from './actions-runtime';
import {
  OPERATOR_COOKIE,
  TERMINAL_COOKIE,
  operatorCookieOptions,
  operatorCookieValue,
  requireTerminal,
  shiftFor,
  terminalCookieOptions,
  terminalToken,
} from './session';
import { formatTime } from '@/lib/format';

const refresh = () => revalidatePath('/', 'layout');

// ------------------------------------------------------------- terminal y turno

export async function pairTerminal(code: string): Promise<Result> {
  return run(async () => {
    const token = await container().pos.pair(code);
    const store = await cookies();
    store.set(TERMINAL_COOKIE, token, terminalCookieOptions);
    store.delete(OPERATOR_COOKIE);
    return undefined;
  });
}

/** Desde la pantalla de PIN: revoca el terminal y deja la tablet lista para otro código. */
export async function unpairTerminal() {
  await container().pos.unpair(await terminalToken());
  const store = await cookies();
  store.delete(TERMINAL_COOKIE);
  store.delete(OPERATOR_COOKIE);
  redirect('/vincular');
}

export async function unlock(userId: string, pin: string): Promise<Result> {
  return run(async () => {
    const terminal = await requireTerminal();
    const result = await container().pos.verifyPin(await terminalToken(), userId, pin);
    if (!result.ok) {
      const messages = {
        no_pin: 'Aún no tienes PIN: pídeselo a un encargado',
        wrong: 'PIN incorrecto',
        locked: `Demasiados intentos. Prueba de nuevo a las ${result.lockedUntil ? formatTime(result.lockedUntil) : 'unos minutos'}`,
      } as const;
      throw new DomainError('UNAUTHENTICATED', messages[result.reason]);
    }
    (await cookies()).set(OPERATOR_COOKIE, operatorCookieValue(terminal.terminalId, userId), operatorCookieOptions);
    return undefined;
  });
}

export async function lock() {
  (await cookies()).delete(OPERATOR_COOKIE);
  redirect('/');
}

// ------------------------------------------------------------- fichar con la tarjeta (sin turno)

/** Quién es y cómo está su jornada. Solo hace falta el terminal vinculado. */
export async function clockLookup(qr: string): Promise<Result<ClockLookup>> {
  return run(async () => {
    await requireTerminal();
    return container().staffCards.clockLookup(await terminalToken(), qr);
  });
}

/** Registra el fichaje con la tarjeta y el PIN del titular. */
export async function clockRegister(input: { qr: string; entryType: ClockEntryType; pin: string }): Promise<Result<{ entryType: ClockEntryType; occurredAt: Date; holderName: string }>> {
  return run(async () => {
    await requireTerminal();
    return container().staffCards.clock(await terminalToken(), input);
  });
}

// ------------------------------------------------------------- cuentas

export async function openTab(input: { tableId?: string; label?: string; customerName?: string; guests?: number }): Promise<Result<string>> {
  return run(async () => {
    const { ctx, terminal } = await shiftFor();
    const id = await container().pos.openTab(ctx, terminal, input);
    refresh();
    return id;
  });
}

export async function setLineQuantity(input: { lineId: string; tabId: string; itemId: string; quantity: number }): Promise<Result> {
  return run(async () => {
    const { ctx, terminal } = await shiftFor();
    await container().pos.setLineQuantity(ctx, terminal, input);
    return undefined;
  });
}

export async function setLineDiscount(lineId: string, discountPct: string): Promise<Result> {
  return run(async () => {
    const { ctx } = await shiftFor('pos.manage');
    await container().pos.setLineDiscount(ctx, lineId, discountPct);
    return undefined;
  });
}

export async function setLineNote(lineId: string, note: string): Promise<Result> {
  return run(async () => {
    const { ctx } = await shiftFor();
    await container().pos.setLineNote(ctx, lineId, note);
    return undefined;
  });
}

/** Envía lo pendiente a barra/cocina; devuelve la marca del envío para imprimir su comanda. */
export async function sendToKitchen(tabId: string): Promise<Result<{ lines: number; sentAt: string | null }>> {
  return run(async () => {
    const { ctx } = await shiftFor();
    const sent = await container().pos.sendToKitchen(ctx, tabId);
    refresh();
    return sent;
  });
}

export async function setCustomerName(tabId: string, name: string): Promise<Result> {
  return run(async () => {
    const { ctx } = await shiftFor();
    await container().pos.setCustomerName(ctx, tabId, name);
    refresh();
    return undefined;
  });
}

export async function precheck(tabId: string): Promise<Result> {
  return run(async () => {
    const { ctx } = await shiftFor();
    await container().pos.precheck(ctx, tabId);
    refresh();
    return undefined;
  });
}

export async function moveTab(tabId: string, tableId: string): Promise<Result> {
  return run(async () => {
    const { ctx } = await shiftFor();
    await container().pos.moveTab(ctx, tabId, tableId);
    refresh();
    return undefined;
  }, 'Cuenta cambiada de mesa');
}

export async function setGuests(tabId: string, guests: number): Promise<Result> {
  return run(async () => {
    const { ctx } = await shiftFor();
    await container().pos.setGuests(ctx, tabId, guests);
    return undefined;
  });
}

export async function cancelTab(tabId: string, reason: string): Promise<Result> {
  return run(async () => {
    const { ctx } = await shiftFor();
    await container().pos.cancelTab(ctx, tabId, reason);
    refresh();
    return undefined;
  });
}

export async function checkout(input: { tabId: string; method: 'cash' | 'card'; tendered?: string }): Promise<Result<CheckoutResult>> {
  return run(async () => {
    const { ctx, terminal } = await shiftFor();
    const result = await container().pos.checkout(ctx, terminal, input);
    refresh();
    return result;
  });
}

/** Cobra solo las unidades elegidas; el resto sigue en la cuenta. */
export async function checkoutSplit(input: {
  tabId: string;
  splitId: string;
  items: { lineId: string; quantity: number }[];
  method: 'cash' | 'card';
  tendered?: string;
}): Promise<Result<CheckoutResult>> {
  return run(async () => {
    const { ctx, terminal } = await shiftFor();
    const result = await container().pos.checkoutSplit(ctx, terminal, input);
    refresh();
    return result;
  });
}

// ------------------------------------------------------------- caja

export async function openCash(openingFloat: string): Promise<Result> {
  return run(async () => {
    const { ctx, terminal } = await shiftFor('pos.manage');
    await container().pos.openCash(ctx, terminal.terminalId, openingFloat);
    refresh();
    return undefined;
  }, 'Caja abierta');
}

export async function addCashMovement(sessionId: string, input: { kind: 'withdrawal' | 'deposit'; amount: string; reason: string }): Promise<Result> {
  return run(async () => {
    const { ctx } = await shiftFor('pos.manage');
    await container().pos.addCashMovement(ctx, sessionId, input);
    refresh();
    return undefined;
  }, input.kind === 'withdrawal' ? 'Retirada registrada' : 'Entrada registrada');
}

export async function closeCash(sessionId: string, input: { counted: string; detail: Record<string, number>; notes?: string }): Promise<Result<string>> {
  return run(async () => {
    const { ctx } = await shiftFor('pos.manage');
    const session = await container().pos.closeCash(ctx, sessionId, input);
    refresh();
    return session.id;
  });
}

// ------------------------------------------------------------- carta, escandallos y stock

export async function saveMenuItem(input: { itemId: string; categoryId: string | null; pvp: string }): Promise<Result> {
  return run(async () => {
    const { ctx } = await shiftFor('pos.manage');
    await container().pos.saveMenuItem(ctx, input);
    refresh();
    return undefined;
  }, 'Carta actualizada');
}

export async function createMenuItem(input: { name: string; categoryId: string; pvp: string; taxRate: string; kind: 'stock' | 'recipe'; unit?: string }): Promise<Result<string>> {
  return run(async () => {
    const { ctx } = await shiftFor('pos.manage');
    const id = await container().pos.createMenuItem(ctx, input);
    refresh();
    return id;
  }, 'Producto creado');
}

export async function saveRecipe(productId: string, lines: { ingredientId: string; quantity: string }[]): Promise<Result> {
  return run(async () => {
    const { ctx } = await shiftFor('pos.manage');
    await container().recipes.save(ctx, { productId, lines });
    refresh();
    return undefined;
  }, 'Escandallo guardado');
}

export async function recount(itemId: string, counted: string): Promise<Result<string>> {
  return run(async () => {
    const { ctx, terminal } = await shiftFor('pos.manage');
    const delta = await container().recipes.recount(ctx, { warehouseId: terminal.warehouseId, itemId, counted });
    refresh();
    return delta;
  });
}

export async function setMinimum(itemId: string, minQuantity: string): Promise<Result> {
  return run(async () => {
    const { ctx, terminal } = await shiftFor('pos.manage');
    await container().recipes.setMinimum(ctx, { warehouseId: terminal.warehouseId, itemId, minQuantity });
    refresh();
    return undefined;
  }, 'Mínimo guardado');
}
