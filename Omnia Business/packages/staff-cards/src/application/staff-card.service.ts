import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DomainError, isDomainError, logger, singleOrganization, type TenantContext } from '@omnia/core';
import { asRow, asRows, withTenant, withoutUser, type Sql, type Tx } from '@omnia/db';
import {
  IssueCardInput,
  PolicyInput,
  QR_PREFIX,
  TOTP_PERIOD_SECONDS,
  RevokeCardInput,
  ValidateQrInput,
  appleQrMessage,
  googleQrPattern,
  newCardSecret,
  parseQr,
  totp,
  totpStep,
  verifyCode,
  type StaffCardSummary,
  type ValidateQrResponse,
  type Wallet,
} from '../domain';
import { buildPkpass, type AppleSignerConfig, type StaffPassData } from '../infrastructure/apple-pass';
import { sendWalletPushes } from '../infrastructure/apns';
import { saveUrl, type GooglePassData, type GoogleWalletClient, type GoogleWalletConfig } from '../infrastructure/google-wallet';
import type { SecretBox } from '../infrastructure/secret-box';

/** Puerto: comprobar el PIN del titular en un terminal (lo implementa @omnia/pos, con bloqueo por intentos). */
export type VerifyHolderPin = (
  terminalToken: string,
  userId: string,
  pin: string,
) => Promise<{ ok: true } | { ok: false; reason: 'no_pin' | 'locked' | 'wrong' }>;

export interface StaffCardDeps {
  box: SecretBox;
  verifyHolderPin: VerifyHolderPin;
  apple?: { config: AppleSignerConfig; images: Record<string, Buffer> } | null;
  google?: { config: GoogleWalletConfig; client: GoogleWalletClient } | null;
}

interface CardRow {
  cardId: string;
  organizationId: string;
  userId: string;
  wallet: Wallet;
  status: 'active' | 'revoked';
  version: number;
  secretEnc: Buffer;
  updatedAt: Date;
  holderName: string;
  roleName: string;
  orgName: string;
  discountPct: string | null;
  memberActive: boolean;
}

export interface TeamMember {
  userId: string;
  name: string;
  roleId: string;
  roleName: string;
  cards: { id: string; wallet: Wallet; issuedAt: string }[];
  /** % que le corresponde por su rol (o la política general); null si no tiene descuento. */
  discountPct: string | null;
}

export interface MyCard {
  id: string;
  wallet: Wallet;
  holderName: string;
  roleName: string;
  orgName: string;
  discountPct: string | null;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const APPLE_AUTH = 'apple-pass-auth';

async function loadCard(tx: Tx, cardId: string, purpose: 'pass' | 'pos' = 'pass'): Promise<CardRow | undefined> {
  return asRow<CardRow>(await tx`
    select card_id, organization_id, user_id, wallet, status, version, secret_enc, updated_at,
           holder_name, role_name, org_name, discount_pct::text, member_active
    from app.staff_card(${cardId}, ${purpose === 'pos'})`);
}

const reject = (message: string, reason: string, code: 'VALIDATION' | 'FORBIDDEN' | 'INVALID_STATE' = 'INVALID_STATE') =>
  new DomainError(code, message, { reason });

export function createStaffCardService(sql: Sql, deps: StaffCardDeps) {
  const { box } = deps;

  const applePassData = (card: Pick<CardRow, 'cardId' | 'version' | 'status' | 'secretEnc' | 'holderName' | 'roleName' | 'orgName' | 'discountPct' | 'updatedAt'>): StaffPassData => {
    const revoked = card.status === 'revoked';
    return {
      cardId: card.cardId,
      version: card.version,
      authenticationToken: box.derive(APPLE_AUTH, card.cardId),
      qrMessage: revoked ? null : appleQrMessage(card.cardId, box.open(card.secretEnc)),
      holderName: card.holderName,
      roleName: card.roleName,
      orgName: card.orgName,
      discountPct: card.discountPct,
      revoked,
      updatedAt: card.updatedAt,
    };
  };

  const googlePassData = (card: CardRow): GooglePassData => ({
    cardId: card.cardId,
    totpSeedHex: box.open(card.secretEnc).toString('hex'),
    qrPattern: googleQrPattern(card.cardId),
    holderName: card.holderName,
    roleName: card.roleName,
    orgName: card.orgName,
    discountPct: card.discountPct,
    revoked: card.status === 'revoked',
  });

  const requireApple = () => {
    if (!deps.apple) throw new DomainError('VALIDATION', 'Apple Wallet no está configurado (faltan los certificados del Pass Type ID)');
    return deps.apple;
  };
  const requireGoogle = () => {
    if (!deps.google) throw new DomainError('VALIDATION', 'Google Wallet no está configurado (falta la cuenta de servicio del emisor)');
    return deps.google;
  };

  return {
    // ------------------------------------------------------------ backoffice

    async policies(ctx: TenantContext) {
      return withTenant(sql, ctx, async (tx) =>
        asRows<{ id: string; roleId: string | null; roleName: string | null; discountPct: string; maxUsesPerDay: number | null; monthlyDiscountCap: string | null; requirePin: boolean; allowSelfService: boolean; isActive: boolean }>(await tx`
          select p.id, p.role_id, r.name as role_name, p.discount_pct::text, p.max_uses_per_day,
                 p.monthly_discount_cap::text, p.require_pin, p.allow_self_service, p.is_active
          from staff_discount_policies p left join roles r on r.id = p.role_id
          where p.organization_id = ${singleOrganization(ctx)}
          order by p.role_id is not null, r.name`),
      );
    },

    async savePolicy(ctx: TenantContext, raw: unknown) {
      const input = PolicyInput.parse(raw);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [row] = await tx<{ id: string }[]>`
          insert into staff_discount_policies (organization_id, role_id, discount_pct, max_uses_per_day, monthly_discount_cap,
                                               require_pin, allow_self_service, is_active)
          values (${orgId}, ${input.roleId}, ${input.discountPct}, ${input.maxUsesPerDay}, ${input.monthlyDiscountCap},
                  ${input.requirePin}, ${input.allowSelfService}, ${input.isActive})
          on conflict (organization_id, role_id) do update
          set discount_pct = excluded.discount_pct, max_uses_per_day = excluded.max_uses_per_day,
              monthly_discount_cap = excluded.monthly_discount_cap, require_pin = excluded.require_pin,
              allow_self_service = excluded.allow_self_service, is_active = excluded.is_active
          returning id`;
        return { id: row!.id };
      });
    },

    async cards(ctx: TenantContext, { userId }: { userId?: string } = {}): Promise<StaffCardSummary[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<StaffCardSummary>(await tx`
          select c.id, c.user_id, coalesce(u.full_name, u.email) as holder_name, c.wallet, c.status, c.version,
                 c.issued_at, c.revoked_at, c.revoke_reason
          from employee_cards c join users u on u.id = c.user_id
          where c.organization_id = ${singleOrganization(ctx)}
            ${userId ? tx`and c.user_id = ${z.uuid().parse(userId)}` : tx``}
          order by c.status, c.issued_at desc
          limit 500`),
      );
    },

    /**
     * Emite una tarjeta. Si la persona ya tenía una viva en ese wallet, se revoca
     * en la misma transacción (un QR filtrado deja de valer al reemitir).
     */
    async issue(ctx: TenantContext, raw: unknown): Promise<{ cardId: string; wallet: Wallet }> {
      const input = IssueCardInput.parse(raw);
      const orgId = singleOrganization(ctx);
      const cardId = await withTenant(sql, ctx, async (tx) => {
        await tx`
          update employee_cards set status = 'revoked', revoke_reason = 'Sustituida por una tarjeta nueva'
          where organization_id = ${orgId} and user_id = ${input.userId} and wallet = ${input.wallet} and status = 'active'`;
        const id = randomUUID();
        // El id se fija aquí porque el token de Apple se deriva de él.
        await tx`
          insert into employee_cards (id, organization_id, user_id, wallet, secret_enc, apple_auth_hash)
          values (${id}, ${orgId}, ${input.userId}, ${input.wallet}, ${box.seal(newCardSecret(input.wallet))},
                  ${input.wallet === 'apple' ? sha256(box.derive(APPLE_AUTH, id)) : null})`;
        return id;
      });
      return { cardId, wallet: input.wallet };
    },

    async revoke(ctx: TenantContext, cardId: string, raw: unknown) {
      const { reason } = RevokeCardInput.parse(raw);
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`
          update employee_cards set status = 'revoked', revoke_reason = ${reason}
          where id = ${z.uuid().parse(cardId)} and status = 'active' returning id`;
        if (rows.length === 0) throw new DomainError('NOT_FOUND', 'Tarjeta no encontrada o ya revocada');
      });
      // El TPV ya la rechaza desde el COMMIT; el aviso al móvil lo envía la cola.
    },

    /** .pkpass para descargar (el titular o un responsable). */
    async applePass(ctx: TenantContext, cardId: string): Promise<Buffer> {
      const apple = requireApple();
      const card = await withTenant(sql, ctx, (tx) => loadCard(tx, z.uuid().parse(cardId)));
      if (!card || card.wallet !== 'apple') throw new DomainError('NOT_FOUND', 'Tarjeta no encontrada');
      return buildPkpass(apple.config, applePassData(card), apple.images);
    },

    /** Crea/actualiza el objeto en Google y devuelve el enlace «Añadir a Google Wallet». */
    async googleSaveUrl(ctx: TenantContext, cardId: string): Promise<string> {
      const google = requireGoogle();
      const card = await withTenant(sql, ctx, (tx) => loadCard(tx, z.uuid().parse(cardId)));
      if (!card || card.wallet !== 'google') throw new DomainError('NOT_FOUND', 'Tarjeta no encontrada');
      if (card.status !== 'active') throw new DomainError('INVALID_STATE', 'La tarjeta está revocada');
      await google.client.upsertObject(googlePassData(card));
      return saveUrl(google.config, card.cardId, [google.config.publicUrl]);
    },

    /** Qué wallets puede generar este despliegue (para mostrar u ocultar botones). */
    walletsAvailable: () => ({ apple: Boolean(deps.apple), google: Boolean(deps.google) }),

    /** Equipo activo con su rol y sus tarjetas vivas (pantalla del responsable). */
    async team(ctx: TenantContext): Promise<TeamMember[]> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) =>
        asRows<TeamMember>(await tx`
          select uo.user_id, coalesce(u.full_name, u.email) as name, r.id as role_id, r.name as role_name,
                 coalesce(json_agg(json_build_object('id', c.id, 'wallet', c.wallet, 'issuedAt', c.issued_at) order by c.wallet)
                          filter (where c.id is not null), '[]') as cards,
                 pol.discount_pct::text as discount_pct
          from user_organizations uo
          join users u on u.id = uo.user_id
          join roles r on r.id = uo.role_id
          -- La del rol o, si no hay, la general (misma regla que app.staff_policy_for, aquí con RLS).
          left join lateral (
            select p.discount_pct from staff_discount_policies p
            where p.organization_id = uo.organization_id and (p.role_id = uo.role_id or p.role_id is null) and p.is_active
            order by p.role_id is null limit 1
          ) pol on true
          left join employee_cards c on c.organization_id = uo.organization_id and c.user_id = uo.user_id and c.status = 'active'
          where uo.organization_id = ${orgId} and uo.status = 'active'
          group by uo.organization_id, uo.user_id, u.full_name, u.email, r.id, r.name, pol.discount_pct
          order by coalesce(u.full_name, u.email)`),
      );
    },

    async roles(ctx: TenantContext): Promise<{ id: string; name: string }[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows(await tx`select id, name from roles where organization_id = ${singleOrganization(ctx)} order by name`),
      );
    },

    /** Las tarjetas vivas de quien ha entrado, con lo que se pinta en pantalla. */
    async myCards(ctx: TenantContext): Promise<MyCard[]> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const ids = await tx<{ id: string }[]>`
          select id from employee_cards
          where organization_id = ${orgId} and user_id = ${ctx.userId} and status = 'active' order by wallet`;
        const cards: MyCard[] = [];
        for (const { id } of ids) {
          const card = await loadCard(tx, id);
          if (card) cards.push({ id: card.cardId, wallet: card.wallet, holderName: card.holderName, roleName: card.roleName, orgName: card.orgName, discountPct: card.discountPct });
        }
        return cards;
      });
    },

    /**
     * El QR del momento, para enseñarlo en la pantalla del propio móvil sin wallet.
     * Solo el titular: ni siquiera el responsable puede ver el QR de otro.
     */
    async currentQr(ctx: TenantContext, cardId: string): Promise<{ qr: string; wallet: Wallet; refreshInSeconds: number | null }> {
      const card = await withTenant(sql, ctx, (tx) => loadCard(tx, z.uuid().parse(cardId)));
      if (!card || card.userId !== ctx.userId) throw new DomainError('NOT_FOUND', 'Tarjeta no encontrada');
      if (card.status !== 'active') throw new DomainError('INVALID_STATE', 'La tarjeta está revocada');
      const secret = box.open(card.secretEnc);
      if (card.wallet === 'apple') return { qr: appleQrMessage(card.cardId, secret), wallet: 'apple', refreshInSeconds: null };
      const now = Date.now() / 1000;
      return {
        qr: `${QR_PREFIX}:${card.cardId}:${totp(secret, totpStep())}`,
        wallet: 'google',
        refreshInSeconds: Math.ceil(TOTP_PERIOD_SECONDS - (now % TOTP_PERIOD_SECONDS)),
      };
    },

    // ------------------------------------------------------------ TPV

    /**
     * El TPV ha leído un QR: se valida y, si procede, se aplica el descuento a la
     * cuenta. El cliente nunca manda el porcentaje: lo decide la política.
     */
    async validateQr(ctx: TenantContext, terminal: { terminalId: string; token: string }, raw: unknown): Promise<ValidateQrResponse> {
      const input = ValidateQrInput.parse(raw);
      const scanned = parseQr(input.qr);
      const log = logger.child({ module: 'staff-cards', cardId: scanned.cardId, terminalId: terminal.terminalId, requestId: ctx.requestId });

      const card = await withTenant(sql, ctx, (tx) => loadCard(tx, scanned.cardId, 'pos'));
      // Tarjeta de otra empresa o inexistente: misma respuesta, para no revelar cuáles existen.
      if (!card) throw reject('Tarjeta no reconocida en esta empresa', 'CARD_UNKNOWN', 'VALIDATION');
      const verdict = verifyCode(card.wallet, box.open(card.secretEnc), scanned.code);
      if (!verdict.ok) {
        log.warn('staff card code rejected', { wallet: card.wallet });
        throw reject(card.wallet === 'google' ? 'El QR ha caducado: pide que lo vuelva a enseñar' : 'Tarjeta no válida', 'CARD_INVALID', 'VALIDATION');
      }
      if (card.status !== 'active') throw reject('Tarjeta revocada', 'CARD_REVOKED');
      if (!card.memberActive) throw reject('El titular ya no está activo en la empresa', 'HOLDER_INACTIVE');
      const holder = { name: card.holderName, role: card.roleName };

      let pinVerified = false;
      if (input.pin) {
        const pin = await deps.verifyHolderPin(terminal.token, card.userId, input.pin);
        if (!pin.ok) {
          if (pin.reason === 'locked') throw reject('PIN bloqueado por demasiados intentos: espera unos minutos', 'PIN_LOCKED', 'FORBIDDEN');
          if (pin.reason === 'no_pin') throw reject('El titular no tiene PIN: un encargado se lo asigna en Ajustes › TPV', 'PIN_WRONG', 'FORBIDDEN');
          throw reject('PIN incorrecto', 'PIN_WRONG', 'FORBIDDEN');
        }
        pinVerified = true;
      }

      try {
        const result = await withTenant(sql, ctx, async (tx) => {
          const [row] = await tx<{ r: { discountPct: number | string; alreadyApplied: boolean; usesToday?: number; maxUsesPerDay?: number | null; discountThisMonth?: number | string; monthlyCap?: number | string | null } }[]>`
            select app.pos_apply_staff_card(${input.tabId}, ${card.cardId}, ${verdict.step}, ${pinVerified}, ${terminal.terminalId}) as r`;
          return row!.r;
        });
        log.info('staff discount applied', { tabId: input.tabId, pct: result.discountPct, alreadyApplied: result.alreadyApplied });
        const money = (v: unknown) => Number(v ?? 0).toFixed(2);
        return {
          status: 'applied',
          holder,
          discount: { percent: money(result.discountPct), scope: 'tab' },
          limits: {
            usesToday: result.usesToday ?? 0,
            maxUsesPerDay: result.maxUsesPerDay ?? null,
            discountThisMonth: money(result.discountThisMonth),
            monthlyCap: result.monthlyCap == null ? null : money(result.monthlyCap),
          },
          alreadyApplied: result.alreadyApplied,
        };
      } catch (error) {
        if (isDomainError(error) && error.details?.reason === 'PIN_REQUIRED') return { status: 'pin_required', holder };
        if (isDomainError(error)) log.info('staff discount rejected', { reason: error.details?.reason });
        throw error;
      }
    },

    async removeFromTab(ctx: TenantContext, tabId: string) {
      await withTenant(sql, ctx, (tx) => tx`select app.pos_remove_staff_card(${z.uuid().parse(tabId)})`);
    },

    // ------------------------------------------------------------ web service de Apple (sin sesión)

    apple: {
      /** Valida la cabecera `Authorization: ApplePass <token>` contra la tarjeta. */
      async latestPass(cardId: string, authToken: string): Promise<{ body: Buffer; lastModified: Date } | null> {
        const apple = requireApple();
        const card = asRow<CardRow>(await withoutUser(sql, (tx) => tx`
          select card_id, organization_id, user_id, 'apple' as wallet, status, version, secret_enc, updated_at,
                 holder_name, role_name, org_name, discount_pct::text, true as member_active
          from app.apple_pass_card(${cardId}, ${sha256(authToken)})`));
        if (!card) return null;
        return { body: buildPkpass(apple.config, applePassData(card), apple.images), lastModified: card.updatedAt };
      },
      async register(cardId: string, authToken: string, device: string, pushToken: string): Promise<'created' | 'exists' | 'unauthorized'> {
        try {
          const [row] = await withoutUser(sql, (tx) => tx<{ created: boolean }[]>`
            select app.apple_pass_register(${cardId}, ${sha256(authToken)}, ${device}, ${pushToken}) as created`);
          return row!.created ? 'created' : 'exists';
        } catch (error) {
          if (isDomainError(error) && error.code === 'FORBIDDEN') return 'unauthorized';
          throw error;
        }
      },
      async unregister(cardId: string, authToken: string, device: string): Promise<boolean> {
        try {
          await withoutUser(sql, (tx) => tx`select app.apple_pass_unregister(${cardId}, ${sha256(authToken)}, ${device})`);
          return true;
        } catch (error) {
          if (isDomainError(error) && error.code === 'FORBIDDEN') return false;
          throw error;
        }
      },
      /** Serials cambiados desde la marca `since` (epoch ms en texto, opaca para Apple). */
      async updatedSerials(device: string, since: string | null): Promise<{ serialNumbers: string[]; lastUpdated: string } | null> {
        const sinceDate = since && /^\d{1,15}$/.test(since) ? new Date(Number(since)) : null;
        const rows = await withoutUser(sql, (tx) => tx<{ card_id: string; updated_at: Date }[]>`
          select card_id, updated_at from app.apple_pass_updated_serials(${device}, ${sinceDate})`);
        if (rows.length === 0) return null;
        const last = Math.max(...rows.map((r) => r.updated_at.getTime()));
        return { serialNumbers: rows.map((r) => r.card_id), lastUpdated: String(last) };
      },
    },

    // ------------------------------------------------------------ cola de actualizaciones

    /**
     * Vacía un lote de la cola: push a los móviles con Apple Wallet y PUT del
     * objeto en Google. Idempotente y seguro con varios procesos a la vez.
     */
    async processWalletUpdates(limit = 50): Promise<{ processed: number; failed: number }> {
      const batch = await withoutUser(sql, (tx) =>
        tx<{ update_id: string; card_id: string; wallet: Wallet; organization_id: string; push_tokens: string[] }[]>`
          select * from app.wallet_updates_claim(${limit})`);
      let failed = 0;
      for (const item of batch) {
        try {
          if (item.wallet === 'apple' && deps.apple && item.push_tokens.length > 0) {
            const results = await sendWalletPushes(deps.apple.config, item.push_tokens);
            for (const gone of results.filter((r) => r.gone)) {
              await withoutUser(sql, (tx) => tx`select app.apple_pass_forget_token(${gone.token})`);
            }
            const errors = results.filter((r) => !r.ok && !r.gone);
            if (errors.length > 0) throw new Error(`APNs: ${errors.map((e) => `${e.status} ${e.reason ?? ''}`).join(', ')}`);
          }
          if (item.wallet === 'google' && deps.google) {
            // Sin sesión de usuario: los datos del pase se leen con una sesión de la propia empresa.
            const card = await googleCardForWorker(sql, item.card_id);
            if (card) await deps.google.client.upsertObject(googlePassData(card));
          }
          await withoutUser(sql, (tx) => tx`select app.wallet_update_done(${item.update_id}, null)`);
        } catch (error) {
          failed++;
          logger.error('wallet update failed', { cardId: item.card_id, wallet: item.wallet, error });
          await withoutUser(sql, (tx) => tx`select app.wallet_update_done(${item.update_id}, ${String((error as Error).message).slice(0, 500)})`);
        }
      }
      return { processed: batch.length - failed, failed };
    },
  };
}

/** El worker no tiene usuario: lee la tarjeta como su propietario lógico (función DEFINER dedicada). */
async function googleCardForWorker(sql: Sql, cardId: string): Promise<CardRow | undefined> {
  return asRow<CardRow>(await withoutUser(sql, (tx) => tx`
    select card_id, organization_id, user_id, wallet, status, version, secret_enc, updated_at,
           holder_name, role_name, org_name, discount_pct::text, member_active
    from app.wallet_card_for_update(${cardId})`));
}

export type StaffCardService = ReturnType<typeof createStaffCardService>;

/** Para tests y scripts: un secreto aleatorio en base64 válido como STAFF_CARD_SECRET_KEY. */
export const generateSecretKey = () => randomBytes(32).toString('base64');
