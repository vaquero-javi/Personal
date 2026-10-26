import { z } from 'zod';
import { DomainError, isoDate, optionalText, requiredText, singleOrganization, type TenantContext } from '@omnia/core';
import { asRows, withTenant, type Sql } from '@omnia/db';

export type EntryType = 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
export type ClockState = 'out' | 'working' | 'on_break';

export interface TimeEntry {
  id: string;
  userId: string;
  entryType: EntryType;
  occurredAt: Date;
  recordedAt: Date;
  source: string;
  latitude: string | null;
  longitude: string | null;
  correctsEntryId: string | null;
  correctionReason: string | null;
  createdByName: string | null;
}

export interface Shift {
  id: string;
  userId: string;
  userName: string;
  startsAt: Date;
  endsAt: Date;
  area: string | null;
  notes: string | null;
}

export interface DayRow {
  userId: string;
  name: string;
  employeeCode: string | null;
  shift: Shift | null;
  entries: TimeEntry[];
  state: ClockState;
  workedMinutes: number;
  /** Tenía turno que ya empezó y no ha fichado entrada. */
  missing: boolean;
  onLeave: boolean;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  leaveType: 'vacation' | 'sick' | 'personal' | 'parental' | 'other';
  startsOn: string;
  endsOn: string;
  halfDay: boolean;
  status: 'requested' | 'approved' | 'rejected' | 'cancelled';
  reason: string | null;
  reviewedByName: string | null;
  days: number;
}

const NEXT_STATE: Record<EntryType, { from: ClockState[]; to: ClockState; error: string }> = {
  clock_in: { from: ['out'], to: 'working', error: 'Ya has fichado la entrada' },
  break_start: { from: ['working'], to: 'on_break', error: 'Para iniciar una pausa tienes que estar trabajando' },
  break_end: { from: ['on_break'], to: 'working', error: 'No tienes ninguna pausa abierta' },
  clock_out: { from: ['working', 'on_break'], to: 'out', error: 'No has fichado la entrada' },
};

/** Estado y minutos trabajados a partir de los fichajes del día (ordenados). */
export function summarizeDay(entries: readonly Pick<TimeEntry, 'entryType' | 'occurredAt'>[], now = new Date()) {
  let state: ClockState = 'out';
  let worked = 0;
  let since: Date | null = null;
  for (const e of entries) {
    if ((e.entryType === 'clock_in' || e.entryType === 'break_end') && since === null) since = e.occurredAt;
    if ((e.entryType === 'clock_out' || e.entryType === 'break_start') && since) {
      worked += e.occurredAt.getTime() - since.getTime();
      since = null;
    }
    state = NEXT_STATE[e.entryType].to;
  }
  if (since && state === 'working') worked += now.getTime() - since.getTime();
  return { state, workedMinutes: Math.max(0, Math.round(worked / 60_000)) };
}

export const ClockInput = z.object({
  entryType: z.enum(['clock_in', 'clock_out', 'break_start', 'break_end']),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).optional(),
  geoConsent: z.boolean().default(false),
  source: z.enum(['web', 'mobile', 'kiosk']).default('web'),
});

export const ManualEntryInput = z.object({
  userId: z.uuid('Elige a la persona'),
  entryType: z.enum(['clock_in', 'clock_out', 'break_start', 'break_end']),
  occurredAt: z.coerce.date({ error: 'Fecha y hora no válidas' }),
  correctionReason: requiredText(300, 'Explica el motivo de la corrección'),
});

export const ShiftInput = z
  .object({
    userId: z.uuid('Elige a la persona'),
    date: isoDate(),
    from: z.string().regex(/^\d{2}:\d{2}$/, 'Hora no válida'),
    to: z.string().regex(/^\d{2}:\d{2}$/, 'Hora no válida'),
    area: optionalText(80),
  })
  .refine((v) => v.to > v.from, { message: 'La salida debe ser posterior a la entrada', path: ['to'] });

export const LeaveInput = z
  .object({
    leaveType: z.enum(['vacation', 'sick', 'personal', 'parental', 'other']),
    startsOn: isoDate(),
    endsOn: isoDate(),
    halfDay: z.boolean().default(false),
    reason: optionalText(300),
  })
  .refine((v) => v.endsOn >= v.startsOn, { message: 'La fecha final no puede ser anterior', path: ['endsOn'] })
  .refine((v) => !v.halfDay || v.startsOn === v.endsOn, { message: 'Medio día solo para un único día', path: ['halfDay'] });

export function createHrService(sql: Sql) {
  return {
    async myDay(ctx: TenantContext) {
      return withTenant(sql, ctx, async (tx) => {
        const entries = asRows<TimeEntry>(await tx`
          select e.id, e.user_id, e.entry_type, e.occurred_at, e.recorded_at, e.source, e.latitude::text, e.longitude::text,
                 e.corrects_entry_id, e.correction_reason, u.full_name as created_by_name
          from time_entries e left join users u on u.id = e.created_by
          where e.user_id = ${ctx.userId} and e.occurred_at >= date_trunc('day', now()) and e.occurred_at < date_trunc('day', now()) + interval '1 day'
          order by e.occurred_at`);
        const shifts = asRows<Shift>(await tx`
          select s.id, s.user_id, u.full_name as user_name, s.starts_at, s.ends_at, s.area, s.notes
          from shifts s join users u on u.id = s.user_id
          where s.user_id = ${ctx.userId} and s.starts_at >= date_trunc('day', now()) and s.starts_at < date_trunc('day', now()) + interval '7 days'
          order by s.starts_at`);
        const week = asRows<{ day: string; minutes: number }>(await tx`
          select d::date::text as day, 0 as minutes
          from generate_series(date_trunc('week', now()), date_trunc('week', now()) + interval '6 days', interval '1 day') d`);
        const weekEntries = asRows<TimeEntry & { day: string }>(await tx`
          select entry_type, occurred_at, occurred_at::date::text as day from time_entries
          where user_id = ${ctx.userId} and occurred_at >= date_trunc('week', now()) order by occurred_at`);
        for (const day of week) {
          const own = weekEntries.filter((e) => e.day === day.day);
          day.minutes = summarizeDay(own).workedMinutes;
        }
        return { entries, ...summarizeDay(entries), shifts, week };
      });
    },

    /** Fichaje propio. La secuencia se valida aquí y la RLS impide fichar por otro. */
    async clock(ctx: TenantContext, raw: unknown) {
      const input = ClockInput.parse(raw);
      const orgId = singleOrganization(ctx);
      const hasGeo = input.latitude !== undefined && input.longitude !== undefined;
      if (hasGeo && !input.geoConsent) throw new DomainError('VALIDATION', 'Hace falta tu consentimiento para guardar la ubicación');
      await withTenant(sql, ctx, async (tx) => {
        // Bloqueo por usuario y día: dos pulsaciones seguidas no crean dos entradas.
        await tx`select pg_advisory_xact_lock(hashtext(${ctx.userId + orgId}))`;
        const today = asRows<TimeEntry>(await tx`
          select entry_type, occurred_at from time_entries
          where organization_id = ${orgId} and user_id = ${ctx.userId}
            and occurred_at >= date_trunc('day', now()) order by occurred_at`);
        const { state } = summarizeDay(today);
        const rule = NEXT_STATE[input.entryType];
        if (!rule.from.includes(state)) throw new DomainError('INVALID_STATE', rule.error);
        await tx`
          insert into time_entries (organization_id, user_id, entry_type, source, latitude, longitude, accuracy_m, geo_consent)
          values (${orgId}, ${ctx.userId}, ${input.entryType}, ${input.source},
                  ${hasGeo ? input.latitude! : null}, ${hasGeo ? input.longitude! : null},
                  ${hasGeo ? (input.accuracy ?? null) : null}, ${hasGeo && input.geoConsent})`;
      });
    },

    /** Registro del día. `scope: 'all'` exige hr.time.read (la RLS lo garantiza igualmente). */
    async day(ctx: TenantContext, date: string, scope: 'all' | 'self' = 'self'): Promise<DayRow[]> {
      const day = isoDate().parse(date);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const people = asRows<{ userId: string; name: string; employeeCode: string | null }>(await tx`
          select uo.user_id, u.full_name as name, uo.employee_code
          from user_organizations uo join users u on u.id = uo.user_id
          where uo.organization_id = ${orgId} and uo.status = 'active' order by u.full_name`);
        const entries = asRows<TimeEntry>(await tx`
          select e.id, e.user_id, e.entry_type, e.occurred_at, e.recorded_at, e.source, e.latitude::text, e.longitude::text,
                 e.corrects_entry_id, e.correction_reason, u.full_name as created_by_name
          from time_entries e left join users u on u.id = e.created_by
          where e.occurred_at >= ${day}::date and e.occurred_at < ${day}::date + 1
          order by e.occurred_at`);
        const shifts = asRows<Shift>(await tx`
          select s.id, s.user_id, u.full_name as user_name, s.starts_at, s.ends_at, s.area, s.notes
          from shifts s join users u on u.id = s.user_id
          where s.starts_at >= ${day}::date and s.starts_at < ${day}::date + 1`);
        const leaves = await tx<{ user_id: string }[]>`
          select user_id from leave_requests where status = 'approved' and ${day}::date between starts_on and ends_on`;
        const onLeave = new Set(leaves.map((l) => l.user_id));
        const now = new Date();
        return people
          .filter((p) => scope === 'all' || p.userId === ctx.userId)
          .map((p) => {
            const own = entries.filter((e) => e.userId === p.userId);
            const shift = shifts.find((s) => s.userId === p.userId) ?? null;
            const { state, workedMinutes } = summarizeDay(own, now);
            return {
              ...p,
              shift,
              entries: own,
              state,
              workedMinutes,
              onLeave: onLeave.has(p.userId),
              missing: !!shift && shift.startsAt < now && !own.some((e) => e.entryType === 'clock_in') && !onLeave.has(p.userId),
            };
          });
      });
    },

    /** Corrección o fichaje olvidado: fila nueva, nunca edición (art. 34.9 ET). */
    async manualEntry(ctx: TenantContext, raw: unknown) {
      const input = ManualEntryInput.parse(raw);
      const orgId = singleOrganization(ctx);
      if (input.occurredAt > new Date()) throw new DomainError('VALIDATION', 'No se registran fichajes en el futuro');
      await withTenant(sql, ctx, (tx) => tx`
        insert into time_entries (organization_id, user_id, entry_type, occurred_at, source, correction_reason)
        values (${orgId}, ${input.userId}, ${input.entryType}, ${input.occurredAt}, 'manual', ${input.correctionReason})`);
    },

    async shifts(ctx: TenantContext, from: string, days = 7): Promise<Shift[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<Shift>(await tx`
          select s.id, s.user_id, u.full_name as user_name, s.starts_at, s.ends_at, s.area, s.notes
          from shifts s join users u on u.id = s.user_id
          where s.starts_at >= ${isoDate().parse(from)}::date and s.starts_at < ${from}::date + ${days}::int
          order by s.starts_at, u.full_name`),
      );
    },

    async createShift(ctx: TenantContext, raw: unknown) {
      const input = ShiftInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        const [overlap] = await tx`
          select 1 from shifts where user_id = ${input.userId}
            and tstzrange(starts_at, ends_at) && tstzrange((${input.date}::date + ${input.from}::time) at time zone 'Europe/Madrid',
                                                          (${input.date}::date + ${input.to}::time) at time zone 'Europe/Madrid')`;
        if (overlap) throw new DomainError('CONFLICT', 'Esa persona ya tiene un turno que se solapa');
        await tx`
          insert into shifts (organization_id, user_id, starts_at, ends_at, area)
          values (${orgId}, ${input.userId},
                  (${input.date}::date + ${input.from}::time) at time zone 'Europe/Madrid',
                  (${input.date}::date + ${input.to}::time) at time zone 'Europe/Madrid', ${input.area ?? null})`;
      });
    },

    async deleteShift(ctx: TenantContext, id: string) {
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`delete from shifts where id = ${z.uuid().parse(id)} returning id`;
        if (rows.length === 0) throw new DomainError('FORBIDDEN', 'No puedes borrar este turno');
      });
    },

    async people(ctx: TenantContext) {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) =>
        asRows<{ userId: string; name: string }>(await tx`
          select uo.user_id, u.full_name as name from user_organizations uo join users u on u.id = uo.user_id
          where uo.organization_id = ${orgId} and uo.status = 'active' order by u.full_name`),
      );
    },

    async leaves(ctx: TenantContext): Promise<LeaveRequest[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<LeaveRequest>(await tx`
          select l.id, l.user_id, u.full_name as user_name, l.leave_type, l.starts_on::text, l.ends_on::text, l.half_day, l.status, l.reason,
                 r.full_name as reviewed_by_name,
                 case when l.half_day then 0.5 else (l.ends_on - l.starts_on + 1) end::float as days
          from leave_requests l join users u on u.id = l.user_id left join users r on r.id = l.reviewed_by
          order by (l.status = 'requested') desc, l.starts_on desc`),
      );
    },

    async requestLeave(ctx: TenantContext, raw: unknown) {
      const input = LeaveInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        const [overlap] = await tx`
          select 1 from leave_requests where user_id = ${ctx.userId} and status in ('requested', 'approved')
            and daterange(starts_on, ends_on, '[]') && daterange(${input.startsOn}::date, ${input.endsOn}::date, '[]')`;
        if (overlap) throw new DomainError('CONFLICT', 'Ya tienes una solicitud en esas fechas');
        await tx`
          insert into leave_requests (organization_id, user_id, leave_type, starts_on, ends_on, half_day, reason)
          values (${orgId}, ${ctx.userId}, ${input.leaveType}, ${input.startsOn}, ${input.endsOn}, ${input.halfDay}, ${input.reason ?? null})`;
      });
    },

    async reviewLeave(ctx: TenantContext, id: string, decision: 'approved' | 'rejected' | 'cancelled') {
      await withTenant(sql, ctx, async (tx) => {
        const rows =
          decision === 'cancelled'
            ? await tx`update leave_requests set status = 'cancelled' where id = ${z.uuid().parse(id)} and status = 'requested' returning id`
            : await tx`
                update leave_requests set status = ${decision}, reviewed_by = ${ctx.userId}, reviewed_at = now()
                where id = ${z.uuid().parse(id)} and status = 'requested' and user_id <> ${ctx.userId} returning id`;
        if (rows.length === 0) {
          throw new DomainError('FORBIDDEN', decision === 'cancelled' ? 'Solo se cancelan solicitudes pendientes' : 'No puedes resolver esta solicitud');
        }
      });
    },
  };
}

export type HrService = ReturnType<typeof createHrService>;
export * from './payroll';
