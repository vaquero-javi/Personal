import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { DomainError, decimalString, optionalText, singleOrganization, type TenantContext } from '@omnia/core';
import { asRow, asRows, withTenant, withoutUser, type Sql, type Tx } from '@omnia/db';
import { insertLines } from '@omnia/invoicing';
import { postSaleConsumption } from '@omnia/recipes';
import { buildTicketLines, netFromGross, sumAmounts, type LineAmounts, type TicketSourceLine } from './pricing';

export * from './pricing';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

/** Terminal resuelto a partir del token del dispositivo. */
export interface PosTerminal {
  terminalId: string;
  organizationId: string;
  terminalName: string;
  warehouseId: string;
  warehouseName: string;
  orgSlug: string;
  orgName: string;
  allowNegativeStock: boolean;
}

export interface PosStaffMember {
  userId: string;
  fullName: string;
  roleName: string;
  hasPin: boolean;
  canManage: boolean;
}

export interface TerminalSummary {
  id: string;
  name: string;
  warehouseId: string;
  warehouseName: string;
  pairedAt: Date | null;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  pairingExpiresAt: Date | null;
  cashOpen: boolean;
}

export interface PinStatus {
  userId: string;
  fullName: string;
  roleName: string;
  canUsePos: boolean;
  hasPin: boolean;
  lockedUntil: Date | null;
}

export type TabStatus = 'open' | 'billing' | 'paid' | 'cancelled';

export interface TabSummary {
  id: string;
  number: number;
  status: TabStatus;
  label: string | null;
  waiterId: string;
  waiterName: string;
  guests: number;
  openedAt: Date;
  precheckAt: Date | null;
  total: string;
  items: number;
  unsent: number;
}

export interface FloorTable {
  id: string;
  name: string;
  area: string;
  seats: number;
  sortOrder: number;
  isActive: boolean;
  tab: TabSummary | null;
}

export interface PosCategory {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuProduct {
  itemId: string;
  name: string;
  categoryId: string;
  unitPrice: string;
  pvp: string;
  taxRate: string;
  onHand: string | null;
  trackStock: boolean;
  hasRecipe: boolean;
}

export interface TabLine {
  id: string;
  itemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  discountPct: string;
  note: string | null;
  sentAt: Date | null;
  addedByName: string;
  /** PVP unitario (con impuestos y descuento) y total de la línea, como en el ticket. */
  unitGross: string;
  total: string;
}

export interface TabDetail extends Omit<TabSummary, 'total' | 'items' | 'unsent'> {
  table: { id: string; name: string; area: string } | null;
  invoiceId: string | null;
  lines: TabLine[];
  totals: LineAmounts;
}

export interface CheckoutResult {
  tabId: string;
  invoiceId: string;
  fullNumber: string;
  total: string;
  method: 'cash' | 'card';
  change: string | null;
}

export interface CashSummary {
  openingFloat: string;
  cashSales: string;
  cardSales: string;
  totalSales: string;
  tickets: number;
  deposits: string;
  withdrawals: string;
  expectedCash: string;
  averageTicket: string;
  firstTicket: string | null;
  lastTicket: string | null;
  taxes: { rate: string; base: string; tax: string }[];
  byWaiter: { name: string; tickets: number; total: string }[];
  topProducts: { name: string; quantity: string; total: string }[];
  cancelledTabs: number;
}

export interface CashSession {
  id: string;
  number: number;
  terminalId: string;
  terminalName: string;
  status: 'open' | 'closed';
  openedAt: Date;
  openedByName: string;
  openingFloat: string;
  closedAt: Date | null;
  closedByName: string | null;
  countedCash: string | null;
  countDetail: Record<string, number> | null;
  expectedCash: string | null;
  difference: string | null;
  notes: string | null;
  summary: CashSummary;
}

export interface CashMovement {
  id: string;
  kind: 'withdrawal' | 'deposit';
  amount: string;
  reason: string;
  createdByName: string;
  createdAt: Date;
}

export interface PrintableTicket {
  invoiceId: string;
  fullNumber: string;
  issueDate: string;
  fiscalRecordAt: Date;
  fiscalRecordHash: string;
  /** Lleva QR VeriFactu: se registró al emitirse y la sociedad está en VeriFactu. */
  verifactu: boolean;
  issuer: { legalName?: string; tradeName?: string; taxId?: string; address?: { line?: string; postalCode?: string; city?: string } };
  lines: { description: string; quantity: string; total: string }[];
  taxes: { rate: string; base: string; tax: string }[];
  total: string;
  method: string | null;
  tableName: string | null;
  waiterName: string | null;
}

// ---------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------

const Pin = z.string().regex(/^\d{4,6}$/, 'El PIN tiene de 4 a 6 cifras');
const Money = decimalString({ scale: 2, sign: 'non-negative' });

const TerminalInput = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre').max(60),
  warehouseId: z.uuid('Elige el almacén del que descuenta'),
});

const TableInput = z.object({
  id: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  name: z.string().trim().min(1, 'Ponle un nombre').max(30),
  area: z.string().trim().min(1).max(30).default('Sala'),
  seats: z.coerce.number().int().min(1).max(99).default(4),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const CATEGORY_ICONS = ['beer', 'wine', 'martini', 'cup-soda', 'coffee', 'utensils', 'salad', 'beef', 'fish', 'ice-cream', 'sandwich', 'pizza'] as const;

const CategoryInput = z.object({
  id: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  name: z.string().trim().min(1, 'Ponle un nombre').max(30),
  icon: z.enum(CATEGORY_ICONS).default('utensils'),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

const MenuItemInput = z.object({
  itemId: z.uuid(),
  categoryId: z.preprocess((v) => (v === '' ? null : v), z.uuid().nullable()),
  pvp: decimalString({ scale: 2, sign: 'non-negative' }),
});

const NewMenuItemInput = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre').max(80),
  categoryId: z.uuid('Elige una categoría'),
  pvp: decimalString({ scale: 2, sign: 'non-negative' }),
  taxRate: decimalString({ scale: 2, sign: 'non-negative' }).default('10'),
  /** «stock»: se cuenta como unidad (refresco, botellín); «recipe»: se descuenta por escandallo. */
  kind: z.enum(['stock', 'recipe']),
  unit: z.string().trim().min(1).max(10).default('ud'),
});

const OpenTabInput = z
  .object({
    tableId: z.uuid().optional(),
    label: z.string().trim().min(1).max(40).optional(),
    guests: z.coerce.number().int().min(1).max(99).default(1),
  })
  .refine((v) => v.tableId || v.label, 'Elige una mesa o ponle nombre a la cuenta');

const LineQuantityInput = z.object({
  lineId: z.uuid(),
  tabId: z.uuid(),
  itemId: z.uuid(),
  quantity: z.coerce.number().int().min(0).max(999),
});

const CheckoutInput = z.object({
  tabId: z.uuid(),
  method: z.enum(['cash', 'card']),
  tendered: z.preprocess((v) => (v === '' || v === null ? undefined : v), Money.optional()),
});

const SplitCheckoutInput = CheckoutInput.extend({
  splitId: z.uuid(),
  items: z.array(z.object({ lineId: z.uuid(), quantity: z.number().int().min(1).max(999) })).min(1, 'Elige al menos un producto').max(200),
});

const CashMovementInput = z.object({
  kind: z.enum(['withdrawal', 'deposit']),
  amount: decimalString({ scale: 2, sign: 'positive' }),
  reason: z.string().trim().min(1, 'Indica el motivo').max(200),
});

const CloseCashInput = z.object({
  counted: Money,
  detail: z.record(z.string(), z.number().int().min(0).max(100_000)).default({}),
  notes: optionalText(500),
});

// ---------------------------------------------------------------------
// Secretos del terminal y del PIN
// ---------------------------------------------------------------------

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Sin 0/O ni 1/I/L: se teclea en una tablet sin confusiones. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newPairingCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export const normalizePairingCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(Pin.parse(pin), salt, 32);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function checkPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scryptAsync(pin, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

const PAIRING_MINUTES = 30;

// ---------------------------------------------------------------------
// Consultas compartidas
// ---------------------------------------------------------------------

interface RawLine extends TicketSourceLine {
  tabId: string;
}

async function openTabLines(tx: Tx, tabIds?: string[]): Promise<RawLine[]> {
  return asRows<RawLine>(await tx`
    select l.tab_id, l.item_id, l.description, l.quantity::text, l.unit_price::text, l.tax_rate::text, l.discount_pct::text
    from pos_tab_lines l join pos_tabs t on t.id = l.tab_id
    where ${tabIds ? tx`t.id in ${tx(tabIds)}` : tx`t.status in ('open', 'billing')`}
    order by l.created_at, l.id`);
}

function totalsByTab(lines: RawLine[]) {
  const byTab = new Map<string, RawLine[]>();
  for (const l of lines) byTab.set(l.tabId, [...(byTab.get(l.tabId) ?? []), l]);
  return new Map([...byTab].map(([id, ls]) => [id, sumAmounts(buildTicketLines(ls))]));
}

const tabSummarySelect = (tx: Tx) => tx`
  select t.id, t.number::int, t.status, t.label, t.waiter_id, coalesce(u.full_name, u.email) as waiter_name, t.guests,
         t.opened_at, t.precheck_at, t.table_id,
         (select count(*)::int from pos_tab_lines l where l.tab_id = t.id) as items,
         (select count(*)::int from pos_tab_lines l where l.tab_id = t.id and l.sent_at is null) as unsent
  from pos_tabs t join users u on u.id = t.waiter_id`;

/** Precio de carta de un artículo (el cliente nunca manda precios). */
async function menuPrice(tx: Tx, warehouseId: string, itemId: string) {
  const [p] = await tx<{ name: string; unit_price: string; tax_rate: string }[]>`
    select name, unit_price::text, tax_rate::text from app.pos_menu(${warehouseId}) where item_id = ${itemId}`;
  if (!p) throw new DomainError('VALIDATION', 'Ese producto no está en la carta');
  return p;
}

async function lockOpenTab(tx: Tx, tabId: string) {
  const [tab] = await tx<{ status: TabStatus }[]>`select status from pos_tabs where id = ${tabId} for update`;
  if (!tab) throw new DomainError('NOT_FOUND', 'Cuenta no encontrada');
  if (tab.status === 'paid' || tab.status === 'cancelled') throw new DomainError('INVALID_STATE', 'La cuenta ya está cerrada');
  // Tocar una cuenta con pre-ticket la reabre: el pre-ticket impreso deja de valer.
  if (tab.status === 'billing') await tx`update pos_tabs set status = 'open', precheck_at = null where id = ${tabId}`;
}

// ---------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------

export function createPosService(sql: Sql) {
  return {
    // ----------------------------------------------------------- dispositivo

    /** Canjea un código de vinculación y devuelve el token que guardará la tablet. */
    async pair(code: string): Promise<string> {
      const normalized = normalizePairingCode(code);
      if (normalized.length !== 8) throw new DomainError('VALIDATION', 'El código tiene 8 caracteres');
      const token = randomBytes(32).toString('base64url');
      const [row] = await withoutUser(sql, (tx) =>
        tx<{ id: string | null }[]>`select app.pos_pair_terminal(${sha256(normalized)}, ${sha256(token)}) as id`,
      );
      if (!row?.id) throw new DomainError('VALIDATION', 'Código no válido o caducado. Genera uno nuevo en Ajustes › TPV.');
      return token;
    },

    async terminal(token: string): Promise<PosTerminal | null> {
      if (!token) return null;
      const rows = await withoutUser(sql, (tx) => tx`select * from app.pos_terminal(${sha256(token)})`);
      return asRow<PosTerminal>(rows) ?? null;
    },

    /** La tablet se desvincula a sí misma: su token deja de valer. */
    async unpair(token: string): Promise<void> {
      if (!token) return;
      await withoutUser(sql, (tx) => tx`select app.pos_unpair_terminal(${sha256(token)})`);
    },

    async staff(token: string): Promise<PosStaffMember[]> {
      return asRows<PosStaffMember>(await withoutUser(sql, (tx) => tx`select * from app.pos_terminal_staff(${sha256(token)})`));
    },

    async verifyPin(token: string, userId: string, pin: string): Promise<{ ok: true } | { ok: false; reason: 'no_pin' | 'locked' | 'wrong'; lockedUntil?: Date }> {
      const user = z.uuid().parse(userId);
      if (!Pin.safeParse(pin).success) return { ok: false, reason: 'wrong' };
      const tokenHash = sha256(token);
      const [challenge] = await withoutUser(sql, (tx) =>
        tx<{ pin_hash: string; locked_until: Date | null }[]>`select * from app.pos_pin_challenge(${tokenHash}, ${user})`,
      );
      if (!challenge) return { ok: false, reason: 'no_pin' };
      if (challenge.locked_until && challenge.locked_until > new Date()) return { ok: false, reason: 'locked', lockedUntil: challenge.locked_until };
      const ok = await checkPin(pin, challenge.pin_hash);
      const [result] = await withoutUser(sql, (tx) =>
        tx<{ locked_until: Date | null }[]>`select app.pos_pin_result(${tokenHash}, ${user}, ${ok}) as locked_until`,
      );
      if (ok) return { ok: true };
      const lockedUntil = result?.locked_until ?? undefined;
      return lockedUntil && lockedUntil > new Date() ? { ok: false, reason: 'locked', lockedUntil } : { ok: false, reason: 'wrong' };
    },

    // ----------------------------------------------------------- terminales (backoffice)

    async terminals(ctx: TenantContext): Promise<TerminalSummary[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<TerminalSummary>(await tx`
          select t.id, t.name, t.warehouse_id, w.name as warehouse_name, t.paired_at, t.last_seen_at, t.revoked_at, t.pairing_expires_at,
                 exists (select 1 from cash_sessions s where s.terminal_id = t.id and s.status = 'open') as cash_open
          from pos_terminals t join warehouses w on w.id = t.warehouse_id
          where t.deleted_at is null
          order by t.name`),
      );
    },

    async createTerminal(ctx: TenantContext, raw: unknown): Promise<{ id: string; code: string; expiresAt: Date }> {
      const input = TerminalInput.parse(raw);
      const orgId = singleOrganization(ctx);
      const code = newPairingCode();
      return withTenant(sql, ctx, async (tx) => {
        const [row] = await tx<{ id: string; pairing_expires_at: Date }[]>`
          insert into pos_terminals (organization_id, name, warehouse_id, pairing_code_hash, pairing_expires_at)
          values (${orgId}, ${input.name}, ${input.warehouseId}, ${sha256(normalizePairingCode(code))}, now() + ${`${PAIRING_MINUTES} minutes`}::interval)
          returning id, pairing_expires_at`;
        return { id: row!.id, code, expiresAt: row!.pairing_expires_at };
      });
    },

    /** Código nuevo para (re)vincular un terminal. El dispositivo anterior sigue hasta que se canjee. */
    async newPairingCode(ctx: TenantContext, terminalId: string): Promise<{ code: string; expiresAt: Date }> {
      const code = newPairingCode();
      return withTenant(sql, ctx, async (tx) => {
        const [row] = await tx<{ pairing_expires_at: Date }[]>`
          update pos_terminals set pairing_code_hash = ${sha256(normalizePairingCode(code))},
                 pairing_expires_at = now() + ${`${PAIRING_MINUTES} minutes`}::interval
          where id = ${z.uuid().parse(terminalId)} and deleted_at is null returning pairing_expires_at`;
        if (!row) throw new DomainError('NOT_FOUND', 'Terminal no encontrado');
        return { code, expiresAt: row.pairing_expires_at };
      });
    },

    async revokeTerminal(ctx: TenantContext, terminalId: string) {
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`
          update pos_terminals set revoked_at = now(), pairing_code_hash = null, pairing_expires_at = null
          where id = ${z.uuid().parse(terminalId)} and revoked_at is null returning id`;
        if (rows.length === 0) throw new DomainError('INVALID_STATE', 'El terminal ya estaba desvinculado');
      });
    },

    /** Borra un terminal sin tablet vinculada. Lógico: sus cajas y cuentas siguen apuntando a él. */
    async deleteTerminal(ctx: TenantContext, terminalId: string) {
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`
          update pos_terminals set deleted_at = now(), revoked_at = coalesce(revoked_at, now()),
                 pairing_code_hash = null, pairing_expires_at = null
          where id = ${z.uuid().parse(terminalId)} and deleted_at is null
            and (revoked_at is not null or paired_at is null)
            and not exists (select 1 from cash_sessions s where s.terminal_id = pos_terminals.id and s.status = 'open')
          returning id`;
        if (rows.length === 0) throw new DomainError('INVALID_STATE', 'Solo se borra un terminal sin tablet vinculada y con la caja cerrada');
      });
    },

    // ----------------------------------------------------------- ajustes

    async settings(ctx: TenantContext): Promise<{ allowNegativeStock: boolean; ticketsVerifactu: boolean }> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [row] = await tx<{ allow: boolean; verifactu: boolean }[]>`
          select coalesce((settings ->> 'allow_negative_stock')::boolean, false) as allow,
                 coalesce((settings ->> 'pos_tickets_verifactu')::boolean, true) as verifactu
          from organizations where id = ${orgId}`;
        return { allowNegativeStock: row?.allow ?? false, ticketsVerifactu: row?.verifactu ?? true };
      });
    },

    /** Tickets del TPV con o sin registro VeriFactu; las facturas del backoffice no cambian. */
    async setTicketsVerifactu(ctx: TenantContext, enabled: boolean) {
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`
          update organizations set settings = settings || jsonb_build_object('pos_tickets_verifactu', ${enabled}::boolean)
          where id = ${orgId} returning id`;
        if (rows.length === 0) throw new DomainError('FORBIDDEN', 'Cambiar esto requiere el permiso de gestión de la sociedad');
      });
    },

    /** Stock negativo: en hostelería no se deja de cobrar porque el inventario no cuadre. */
    async setAllowNegativeStock(ctx: TenantContext, allow: boolean) {
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`
          update organizations set settings = settings || jsonb_build_object('allow_negative_stock', ${allow}::boolean)
          where id = ${orgId} returning id`;
        if (rows.length === 0) throw new DomainError('FORBIDDEN', 'Cambiar esto requiere el permiso de gestión de la sociedad');
      });
    },

    // ----------------------------------------------------------- PIN

    async pinStatus(ctx: TenantContext): Promise<PinStatus[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<PinStatus>(await tx`
          select uo.user_id, coalesce(u.full_name, u.email) as full_name, r.name as role_name, ps.has_pin, ps.locked_until,
                 exists (select 1 from role_permissions rp where rp.role_id = r.id and rp.permission_code in ('*', 'pos.*', 'pos.use')) as can_use_pos
          from user_organizations uo
          join users u on u.id = uo.user_id
          join roles r on r.id = uo.role_id
          join app.pos_pin_status() ps on ps.organization_id = uo.organization_id and ps.user_id = uo.user_id
          where uo.status = 'active'
          order by can_use_pos desc, coalesce(u.full_name, u.email)`),
      );
    },

    async setPin(ctx: TenantContext, userId: string, pin: string) {
      const orgId = singleOrganization(ctx);
      const hash = await hashPin(pin);
      await withTenant(sql, ctx, (tx) => tx`select app.pos_set_pin(${orgId}, ${z.uuid().parse(userId)}, ${hash})`);
    },

    async clearPin(ctx: TenantContext, userId: string) {
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, (tx) => tx`select app.pos_clear_pin(${orgId}, ${z.uuid().parse(userId)})`);
    },

    // ----------------------------------------------------------- sala

    async floor(ctx: TenantContext, { includeInactive = false } = {}): Promise<{ tables: FloorTable[]; counterTabs: TabSummary[] }> {
      return withTenant(sql, ctx, async (tx) => {
        const tables = asRows<Omit<FloorTable, 'tab'>>(await tx`
          select id, name, area, seats, sort_order, is_active from pos_tables
          where ${includeInactive ? tx`true` : tx`is_active`}
          order by area, sort_order, name`);
        const tabs = asRows<Omit<TabSummary, 'total'> & { tableId: string | null }>(await tx`
          ${tabSummarySelect(tx)} where t.status in ('open', 'billing') order by t.opened_at`);
        const totals = totalsByTab(await openTabLines(tx));
        const withTotal = tabs.map(({ tableId, ...t }) => ({ tableId, tab: { ...t, total: totals.get(t.id)?.total ?? '0.00' } }));
        return {
          tables: tables.map((table) => ({ ...table, tab: withTotal.find((t) => t.tableId === table.id)?.tab ?? null })),
          counterTabs: withTotal.filter((t) => t.tableId === null).map((t) => t.tab),
        };
      });
    },

    async saveTable(ctx: TenantContext, raw: unknown) {
      const input = TableInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        if (input.id) {
          await tx`update pos_tables set name = ${input.name}, area = ${input.area}, seats = ${input.seats}, sort_order = ${input.sortOrder} where id = ${input.id}`;
        } else {
          await tx`insert into pos_tables (organization_id, name, area, seats, sort_order) values (${orgId}, ${input.name}, ${input.area}, ${input.seats}, ${input.sortOrder})`;
        }
      });
    },

    /** Borra la mesa; si ya tuvo cuentas, la desactiva (el histórico la referencia). */
    async removeTable(ctx: TenantContext, tableId: string): Promise<'deleted' | 'deactivated'> {
      const id = z.uuid().parse(tableId);
      return withTenant(sql, ctx, async (tx) => {
        const [used] = await tx`select 1 from pos_tabs where table_id = ${id} limit 1`;
        if (used) {
          const [open] = await tx`select 1 from pos_tabs where table_id = ${id} and status in ('open', 'billing')`;
          if (open) throw new DomainError('INVALID_STATE', 'La mesa tiene una cuenta abierta');
          await tx`update pos_tables set is_active = false where id = ${id}`;
          return 'deactivated' as const;
        }
        await tx`delete from pos_tables where id = ${id}`;
        return 'deleted' as const;
      });
    },

    async setTableActive(ctx: TenantContext, tableId: string, active: boolean) {
      await withTenant(sql, ctx, (tx) => tx`update pos_tables set is_active = ${active} where id = ${z.uuid().parse(tableId)}`);
    },

    // ----------------------------------------------------------- carta

    async categories(ctx: TenantContext): Promise<PosCategory[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<PosCategory>(await tx`select id, name, icon, sort_order, is_active from pos_categories order by sort_order, name`),
      );
    },

    async saveCategory(ctx: TenantContext, raw: unknown) {
      const input = CategoryInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        if (input.id) {
          await tx`update pos_categories set name = ${input.name}, icon = ${input.icon}, sort_order = ${input.sortOrder} where id = ${input.id}`;
        } else {
          await tx`insert into pos_categories (organization_id, name, icon, sort_order) values (${orgId}, ${input.name}, ${input.icon}, ${input.sortOrder})`;
        }
      });
    },

    /** Los productos de la categoría salen de la carta, pero no se borran. */
    async removeCategory(ctx: TenantContext, categoryId: string) {
      await withTenant(sql, ctx, (tx) => tx`delete from pos_categories where id = ${z.uuid().parse(categoryId)}`);
    },

    async menu(ctx: TenantContext, warehouseId: string): Promise<{ categories: PosCategory[]; products: MenuProduct[] }> {
      return withTenant(sql, ctx, async (tx) => ({
        categories: asRows<PosCategory>(await tx`select id, name, icon, sort_order, is_active from pos_categories where is_active order by sort_order, name`),
        products: asRows<MenuProduct>(await tx`
          select item_id, name, category_id, unit_price::text, pvp::text, tax_rate::text, on_hand::text, track_stock, has_recipe
          from app.pos_menu(${z.uuid().parse(warehouseId)})`),
      }));
    },

    /** Coloca un artículo en la carta (o lo quita con categoría vacía) y fija su PVP en la tarifa general. */
    async saveMenuItem(ctx: TenantContext, raw: unknown) {
      const input = MenuItemInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        const [item] = await tx<{ tax: string }[]>`
          update inventory_items set pos_category_id = ${input.categoryId} where id = ${input.itemId} returning default_tax_rate::text as tax`;
        if (!item) throw new DomainError('NOT_FOUND', 'Producto no encontrado');
        const [list] = await tx<{ id: string; prices_include_tax: boolean }[]>`select id, prices_include_tax from price_lists where is_default`;
        if (!list) throw new DomainError('VALIDATION', 'Crea antes una tarifa general en Ventas › Tarifas');
        const price = list.prices_include_tax ? input.pvp : netFromGross(input.pvp, item.tax);
        const updated = await tx`
          update price_list_items set unit_price = ${price}
          where price_list_id = ${list.id} and item_id = ${input.itemId} and min_quantity = 1 returning id`;
        if (updated.length === 0) {
          await tx`insert into price_list_items (organization_id, price_list_id, item_id, unit_price) values (${orgId}, ${list.id}, ${input.itemId}, ${price})`;
        }
      });
    },

    async createMenuItem(ctx: TenantContext, raw: unknown): Promise<string> {
      const input = NewMenuItemInput.parse(raw);
      const orgId = singleOrganization(ctx);
      const id = await withTenant(sql, ctx, async (tx) => {
        const sku = `CARTA-${Date.now().toString(36).toUpperCase()}`;
        const [row] = await tx<{ id: string }[]>`
          insert into inventory_items (organization_id, sku, name, unit_of_measure, default_tax_rate, item_type)
          values (${orgId}, ${sku}, ${input.name}, ${input.unit}, ${input.taxRate}, ${input.kind === 'stock' ? 'stockable' : 'consumable'})
          returning id`;
        return row!.id;
      });
      await this.saveMenuItem(ctx, { itemId: id, categoryId: input.categoryId, pvp: input.pvp });
      return id;
    },

    // ----------------------------------------------------------- cuentas

    /** Abre la cuenta de una mesa (o devuelve la que ya tiene) o una cuenta de barra con nombre. */
    async openTab(ctx: TenantContext, terminal: PosTerminal, raw: unknown): Promise<string> {
      const input = OpenTabInput.parse(raw);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        if (input.tableId) {
          const [existing] = await tx<{ id: string }[]>`select id from pos_tabs where table_id = ${input.tableId} and status in ('open', 'billing')`;
          if (existing) return existing.id;
        }
        const [row] = await tx<{ id: string }[]>`
          insert into pos_tabs (organization_id, table_id, label, terminal_id, guests)
          values (${orgId}, ${input.tableId ?? null}, ${input.tableId ? null : input.label!}, ${terminal.terminalId}, ${input.guests})
          returning id`;
        return row!.id;
      });
    },

    async tab(ctx: TenantContext, tabId: string): Promise<TabDetail> {
      const id = z.uuid().parse(tabId);
      return withTenant(sql, ctx, async (tx) => {
        const tab = asRow<TabDetail & { tableId: string | null; tableName: string | null; tableArea: string | null }>(await tx`
          select t.id, t.number::int, t.status, t.label, t.waiter_id, coalesce(u.full_name, u.email) as waiter_name, t.guests,
                 t.opened_at, t.precheck_at, t.invoice_id, t.table_id, pt.name as table_name, pt.area as table_area
          from pos_tabs t join users u on u.id = t.waiter_id left join pos_tables pt on pt.id = t.table_id
          where t.id = ${id}`);
        if (!tab) throw new DomainError('NOT_FOUND', 'Cuenta no encontrada');
        const lines = asRows<Omit<TabLine, 'unitGross' | 'total'>>(await tx`
          select l.id, l.item_id, l.description, l.quantity::text, l.unit_price::text, l.tax_rate::text, l.discount_pct::text,
                 l.note, l.sent_at, coalesce(u.full_name, u.email) as added_by_name
          from pos_tab_lines l join users u on u.id = l.added_by
          where l.tab_id = ${id} order by l.created_at, l.id`);
        const { tableId, tableName, tableArea, ...rest } = tab;
        return {
          ...rest,
          table: tableId ? { id: tableId, name: tableName!, area: tableArea! } : null,
          lines: lines.map((l) => {
            const ticket = buildTicketLines([l]);
            const one = buildTicketLines([{ ...l, quantity: '1' }]);
            return { ...l, unitGross: one[0]!.total, total: sumAmounts(ticket).total };
          }),
          totals: sumAmounts(buildTicketLines(lines)),
        };
      });
    },

    /**
     * Fija la cantidad de una línea (0 la quita). La línea la identifica el
     * terminal con un UUID: repetir la petición deja el mismo resultado.
     */
    async setLineQuantity(ctx: TenantContext, terminal: PosTerminal, raw: unknown) {
      const input = LineQuantityInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        await lockOpenTab(tx, input.tabId);
        const [line] = await tx<{ quantity: string }[]>`select quantity::text from pos_tab_lines where id = ${input.lineId}`;
        if (line) {
          if (input.quantity === 0) await tx`delete from pos_tab_lines where id = ${input.lineId}`;
          else if (Number(line.quantity) !== input.quantity) await tx`update pos_tab_lines set quantity = ${input.quantity} where id = ${input.lineId}`;
          return;
        }
        if (input.quantity === 0) return;
        const price = await menuPrice(tx, terminal.warehouseId, input.itemId);
        await tx`
          insert into pos_tab_lines (id, organization_id, tab_id, item_id, description, quantity, unit_price, tax_rate)
          values (${input.lineId}, ${orgId}, ${input.tabId}, ${input.itemId}, ${price.name}, ${input.quantity}, ${price.unit_price}, ${price.tax_rate})
          on conflict (id) do nothing`;
      });
    },

    async setLineDiscount(ctx: TenantContext, lineId: string, discountPct: string) {
      const pct = decimalString({ scale: 2, sign: 'non-negative' }).refine((v) => Number(v) <= 100, 'Máximo 100 %').parse(discountPct);
      await withTenant(sql, ctx, async (tx) => {
        const [line] = await tx<{ tab_id: string }[]>`select tab_id from pos_tab_lines where id = ${z.uuid().parse(lineId)}`;
        if (!line) throw new DomainError('NOT_FOUND', 'Línea no encontrada');
        await lockOpenTab(tx, line.tab_id);
        await tx`update pos_tab_lines set discount_pct = ${pct} where id = ${lineId}`;
      });
    },

    async setLineNote(ctx: TenantContext, lineId: string, note: string) {
      await withTenant(sql, ctx, async (tx) => {
        const [line] = await tx<{ tab_id: string }[]>`select tab_id from pos_tab_lines where id = ${z.uuid().parse(lineId)}`;
        if (!line) throw new DomainError('NOT_FOUND', 'Línea no encontrada');
        await lockOpenTab(tx, line.tab_id);
        await tx`update pos_tab_lines set note = ${note.trim().slice(0, 120) || null} where id = ${lineId}`;
      });
    },

    /** Marca como enviado a cocina/barra lo pendiente. Devuelve cuántas líneas. */
    async sendToKitchen(ctx: TenantContext, tabId: string): Promise<number> {
      return withTenant(sql, ctx, async (tx) => {
        await lockOpenTab(tx, z.uuid().parse(tabId));
        const rows = await tx`update pos_tab_lines set sent_at = now() where tab_id = ${tabId} and sent_at is null returning id`;
        return rows.length;
      });
    },

    /** Pre-ticket: la mesa pasa a «cobrando». */
    async precheck(ctx: TenantContext, tabId: string) {
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`
          update pos_tabs set status = 'billing', precheck_at = now()
          where id = ${z.uuid().parse(tabId)} and status in ('open', 'billing')
            and exists (select 1 from pos_tab_lines l where l.tab_id = pos_tabs.id)
          returning id`;
        if (rows.length === 0) throw new DomainError('INVALID_STATE', 'La cuenta está vacía o cerrada');
      });
    },

    async moveTab(ctx: TenantContext, tabId: string, tableId: string) {
      await withTenant(sql, ctx, async (tx) => {
        const [busy] = await tx`select 1 from pos_tabs where table_id = ${z.uuid().parse(tableId)} and status in ('open', 'billing')`;
        if (busy) throw new DomainError('CONFLICT', 'La mesa de destino ya tiene una cuenta abierta');
        const rows = await tx`
          update pos_tabs set table_id = ${tableId}, label = null
          where id = ${z.uuid().parse(tabId)} and status in ('open', 'billing') returning id`;
        if (rows.length === 0) throw new DomainError('INVALID_STATE', 'La cuenta ya está cerrada');
      });
    },

    async setGuests(ctx: TenantContext, tabId: string, guests: number) {
      const n = z.number().int().min(1).max(99).parse(guests);
      await withTenant(sql, ctx, (tx) => tx`update pos_tabs set guests = ${n} where id = ${z.uuid().parse(tabId)} and status in ('open', 'billing')`);
    },

    async cancelTab(ctx: TenantContext, tabId: string, reason: string) {
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`
          update pos_tabs set status = 'cancelled', closed_at = now(), closed_by = app.current_user_id(),
                 cancel_reason = ${reason.trim().slice(0, 200) || null}
          where id = ${z.uuid().parse(tabId)} and status in ('open', 'billing') returning id`;
        if (rows.length === 0) throw new DomainError('INVALID_STATE', 'La cuenta ya está cerrada');
      });
    },

    async checkout(ctx: TenantContext, terminal: PosTerminal, raw: unknown): Promise<CheckoutResult> {
      const input = CheckoutInput.parse(raw);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, (tx) => payTab(tx, orgId, terminal, input));
    },

    /**
     * Cobra solo una parte de la cuenta: las unidades elegidas pasan a una cuenta
     * nueva (splitId, generado por el terminal) que se cobra en la misma
     * transacción. Si el cobro falla no se divide nada; reintentar con el mismo
     * splitId devuelve el mismo ticket.
     */
    async checkoutSplit(ctx: TenantContext, terminal: PosTerminal, raw: unknown): Promise<CheckoutResult> {
      const input = SplitCheckoutInput.parse(raw);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        await tx`select app.pos_split_tab(${input.tabId}, ${input.splitId}, ${tx.json(input.items)})`;
        return payTab(tx, orgId, terminal, { tabId: input.splitId, method: input.method, tendered: input.tendered });
      });
    },

    async ticket(ctx: TenantContext, invoiceId: string): Promise<PrintableTicket> {
      const id = z.uuid().parse(invoiceId);
      return withTenant(sql, ctx, async (tx) => {
        const ticket = asRow<Omit<PrintableTicket, 'lines' | 'taxes'>>(await tx`
          select i.id as invoice_id, i.full_number, i.issue_date::text, i.fiscal_record_at, i.fiscal_record_hash, i.total::text,
                 coalesce(i.issuer_snapshot, '{}'::jsonb) as issuer,
                 (o.fiscal_regime = 'verifactu' and i.fiscal_status <> 'not_applicable') as verifactu,
                 (select method from invoice_payments p where p.invoice_id = i.id limit 1) as method,
                 coalesce(pt.name, t.label) as table_name, coalesce(u.full_name, u.email) as waiter_name
          from invoices i
          join organizations o on o.id = i.organization_id
          left join pos_tabs t on t.invoice_id = i.id
          left join pos_tables pt on pt.id = t.table_id
          left join users u on u.id = t.waiter_id
          where i.id = ${id} and i.invoice_type = 'F2' and i.status <> 'draft'`);
        if (!ticket) throw new DomainError('NOT_FOUND', 'Ticket no encontrado');
        const lines = asRows<PrintableTicket['lines'][number]>(await tx`
          select description, quantity::text, (line_base + line_tax)::text as total from invoice_lines where invoice_id = ${id} order by line_no`);
        const taxes = asRows<PrintableTicket['taxes'][number]>(await tx`
          select tax_rate::text as rate, sum(line_base)::text as base, sum(line_tax)::text as tax
          from invoice_lines where invoice_id = ${id} group by tax_rate order by tax_rate`);
        return { ...ticket, lines, taxes };
      });
    },

    async recentTickets(ctx: TenantContext, terminalId: string) {
      return withTenant(sql, ctx, async (tx) =>
        asRows<{ invoiceId: string; fullNumber: string; total: string; method: string; closedAt: Date; tableName: string | null; label: string | null }>(await tx`
          select t.invoice_id, i.full_number, i.total::text, p.method, t.closed_at, pt.name as table_name, t.label
          from pos_tabs t
          join invoices i on i.id = t.invoice_id
          left join pos_tables pt on pt.id = t.table_id
          left join lateral (select method from invoice_payments where invoice_id = i.id limit 1) p on true
          where t.terminal_id = ${z.uuid().parse(terminalId)} and t.status = 'paid'
          order by t.closed_at desc limit 15`),
      );
    },

    // ----------------------------------------------------------- caja

    async cashSession(ctx: TenantContext, terminalId: string): Promise<CashSession | null> {
      return withTenant(sql, ctx, async (tx) => {
        const [row] = await tx<{ id: string }[]>`
          select id from cash_sessions where terminal_id = ${z.uuid().parse(terminalId)} and status = 'open'`;
        return row ? loadSession(tx, row.id) : null;
      });
    },

    async cashReport(ctx: TenantContext, sessionId: string): Promise<CashSession> {
      return withTenant(sql, ctx, (tx) => loadSession(tx, z.uuid().parse(sessionId)));
    },

    async cashHistory(ctx: TenantContext, terminalId: string) {
      return withTenant(sql, ctx, async (tx) =>
        asRows<{ id: string; number: number; status: string; openedAt: Date; closedAt: Date | null; totalSales: string; difference: string | null }>(await tx`
          select s.id, s.number::int, s.status, s.opened_at, s.closed_at,
                 coalesce(s.report ->> 'totalSales', '0') as total_sales, s.difference::text
          from cash_sessions s where s.terminal_id = ${z.uuid().parse(terminalId)}
          order by s.opened_at desc limit 20`),
      );
    },

    async openCash(ctx: TenantContext, terminalId: string, openingFloat: string): Promise<string> {
      const amount = Money.parse(openingFloat);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [open] = await tx`select 1 from cash_sessions where terminal_id = ${terminalId} and status = 'open'`;
        if (open) throw new DomainError('INVALID_STATE', 'La caja de este terminal ya está abierta');
        const [row] = await tx<{ id: string }[]>`
          insert into cash_sessions (organization_id, terminal_id, opening_float)
          values (${orgId}, ${z.uuid().parse(terminalId)}, ${amount}) returning id`;
        return row!.id;
      });
    },

    async cashMovements(ctx: TenantContext, sessionId: string): Promise<CashMovement[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<CashMovement>(await tx`
          select m.id, m.kind, m.amount::text, m.reason, coalesce(u.full_name, u.email) as created_by_name, m.created_at
          from cash_movements m join users u on u.id = m.created_by
          where m.cash_session_id = ${z.uuid().parse(sessionId)} order by m.created_at`),
      );
    },

    async addCashMovement(ctx: TenantContext, sessionId: string, raw: unknown) {
      const input = CashMovementInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, (tx) => tx`
        insert into cash_movements (organization_id, cash_session_id, kind, amount, reason)
        values (${orgId}, ${z.uuid().parse(sessionId)}, ${input.kind}, ${input.amount}, ${input.reason})`);
    },

    async closeCash(ctx: TenantContext, sessionId: string, raw: unknown): Promise<CashSession> {
      const input = CloseCashInput.parse(raw);
      return withTenant(sql, ctx, async (tx) => {
        await tx`select id from app.close_cash_session(${z.uuid().parse(sessionId)}, ${input.counted}, ${tx.json(input.detail)}, ${input.notes ?? null})`;
        return loadSession(tx, sessionId);
      });
    },
  };
}

/**
 * Cobro, todo o nada: ticket F2 con su huella, salida de stock (con
 * escandallos), cobro en la caja del terminal y cierre de la cuenta.
 * Cobrar dos veces la misma cuenta devuelve el mismo ticket.
 */
async function payTab(tx: Tx, orgId: string, terminal: PosTerminal, input: z.infer<typeof CheckoutInput>): Promise<CheckoutResult> {
  const [tab] = await tx<{ status: TabStatus; invoice_id: string | null }[]>`
    select status, invoice_id from pos_tabs where id = ${input.tabId} for update`;
  if (!tab) throw new DomainError('NOT_FOUND', 'Cuenta no encontrada');
  if (tab.status === 'paid') {
    const [done] = await tx<{ full_number: string; total: string; method: 'cash' | 'card' }[]>`
      select i.full_number, i.total::text, (select method from invoice_payments where invoice_id = i.id limit 1) as method
      from invoices i where i.id = ${tab.invoice_id}`;
    return { tabId: input.tabId, invoiceId: tab.invoice_id!, fullNumber: done!.full_number, total: done!.total, method: done!.method, change: null };
  }
  if (tab.status === 'cancelled') throw new DomainError('INVALID_STATE', 'La cuenta está anulada');

  const [session] = await tx<{ id: string }[]>`
    select id from cash_sessions where terminal_id = ${terminal.terminalId} and status = 'open'`;
  if (!session) throw new DomainError('VALIDATION', 'La caja de este terminal está cerrada: un encargado debe abrirla');

  const lines = buildTicketLines(await openTabLines(tx, [input.tabId]));
  if (lines.length === 0) throw new DomainError('VALIDATION', 'La cuenta está vacía');
  const expected = sumAmounts(lines).total;
  if (input.method === 'cash' && input.tendered !== undefined && Number(input.tendered) < Number(expected)) {
    throw new DomainError('VALIDATION', 'El efectivo entregado no cubre el total');
  }

  const [series] = await tx<{ id: string }[]>`
    select id from invoice_series
    where invoice_kind = 'simplified' and is_active and fiscal_year = extract(year from current_date)::int
    order by code limit 1`;
  if (!series) throw new DomainError('VALIDATION', 'Falta una serie de tickets (simplificadas) para este año en Facturación › Series');

  const [inv] = await tx<{ id: string }[]>`
    insert into invoices (organization_id, direction, party_id, invoice_type, due_date)
    values (${orgId}, 'issued', null, 'F2', current_date) returning id`;
  await insertLines(tx, orgId, inv!.id, lines.map((l) => ({ itemId: l.itemId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, taxRate: l.taxRate })));
  const [issued] = await tx<{ full_number: string; total: string }[]>`
    select full_number, total::text from app.issue_invoice(${inv!.id}, ${series.id}, current_date, true)`;
  if (issued!.total !== expected) {
    // Nunca debería ocurrir: pricing.ts replica la aritmética de invoice_lines.
    throw new Error(`Descuadre entre la cuenta (${expected}) y el ticket (${issued!.total})`);
  }

  await postSaleConsumption(tx, { organizationId: orgId, warehouseId: terminal.warehouseId, invoiceId: inv!.id });

  await tx`
    insert into invoice_payments (organization_id, invoice_id, amount, method, cash_session_id)
    values (${orgId}, ${inv!.id}, ${issued!.total}, ${input.method}, ${session.id})`;
  await tx`
    update pos_tabs set status = 'paid', invoice_id = ${inv!.id}, cash_session_id = ${session.id},
           closed_at = now(), closed_by = app.current_user_id()
    where id = ${input.tabId}`;

  const change = input.method === 'cash' && input.tendered !== undefined ? (Number(input.tendered) - Number(issued!.total)).toFixed(2) : null;
  return { tabId: input.tabId, invoiceId: inv!.id, fullNumber: issued!.full_number, total: issued!.total, method: input.method, change };
}

async function loadSession(tx: Tx, id: string): Promise<CashSession> {
  const row = asRow<Omit<CashSession, 'summary'> & { report: CashSummary | null; live: CashSummary }>(await tx`
    select s.id, s.number::int, s.terminal_id, coalesce(t.name, 'este terminal') as terminal_name, s.status, s.opened_at,
           coalesce(uo.full_name, uo.email) as opened_by_name, s.opening_float::text,
           s.closed_at, coalesce(uc.full_name, uc.email) as closed_by_name,
           s.counted_cash::text, s.count_detail, s.expected_cash::text, s.difference::text, s.notes, s.report,
           app.cash_session_summary(s.id) as live
    from cash_sessions s
    -- Left join: el camarero ve la caja pero no la tabla de terminales (pos.manage).
    left join pos_terminals t on t.id = s.terminal_id
    join users uo on uo.id = s.opened_by
    left join users uc on uc.id = s.closed_by
    where s.id = ${id}`);
  if (!row) throw new DomainError('NOT_FOUND', 'Caja no encontrada');
  const { report, live, ...session } = row;
  // Una caja cerrada muestra el reporte Z congelado; una abierta, el X en vivo.
  return { ...session, summary: normalizeSummary(report ?? live) };
}

/** jsonb devuelve números: los importes se pasan a texto con dos decimales. */
function normalizeSummary(raw: CashSummary): CashSummary {
  const money = (v: unknown) => Number(v ?? 0).toFixed(2);
  return {
    openingFloat: money(raw.openingFloat),
    cashSales: money(raw.cashSales),
    cardSales: money(raw.cardSales),
    totalSales: money(raw.totalSales),
    tickets: Number(raw.tickets ?? 0),
    deposits: money(raw.deposits),
    withdrawals: money(raw.withdrawals),
    expectedCash: money(raw.expectedCash),
    averageTicket: money(raw.averageTicket),
    firstTicket: raw.firstTicket ?? null,
    lastTicket: raw.lastTicket ?? null,
    taxes: (raw.taxes ?? []).map((t) => ({ rate: Number(t.rate).toString(), base: money(t.base), tax: money(t.tax) })),
    byWaiter: (raw.byWaiter ?? []).map((w) => ({ name: w.name, tickets: Number(w.tickets), total: money(w.total) })),
    topProducts: (raw.topProducts ?? []).map((p) => ({ name: p.name, quantity: Number(p.quantity).toString(), total: money(p.total) })),
    cancelledTabs: Number(raw.cancelledTabs ?? 0),
  };
}

export type PosService = ReturnType<typeof createPosService>;
