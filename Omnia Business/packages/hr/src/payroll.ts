import { z } from 'zod';
import { DomainError, decimalString, singleOrganization, toStoredFile, type StoredFile, type TenantContext } from '@omnia/core';
import { asRows, withTenant, type Sql, type Tx } from '@omnia/db';

// Nóminas: RRHH sube el documento de cada persona y mes; cada persona ve las
// suyas. Quién ve qué lo decide Postgres (RLS): aquí no se filtra por usuario.

export type PayslipKind = 'monthly' | 'bonus' | 'settlement';
export type PayslipFileType = 'application/pdf' | 'image/jpeg' | 'image/png';

export interface Payslip {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  employeeCode: string | null;
  /** Primer día del mes, AAAA-MM-01. */
  period: string;
  kind: PayslipKind;
  netAmount: string | null;
  fileName: string;
  contentType: PayslipFileType;
  byteSize: number;
  viewedAt: Date | null;
  createdAt: Date;
  createdByName: string | null;
}

export interface PayslipEmployee {
  userId: string;
  name: string;
  email: string;
  employeeCode: string | null;
  status: 'active' | 'invited' | 'suspended';
}

/** «1.234,56» y «1234.56» → «1234.56». */
const spanishAmount = (value: unknown) =>
  typeof value === 'string' && value.includes(',') ? value.replace(/\./g, '') : value;

export const PayslipInput = z.object({
  userId: z.uuid('Elige a la persona'),
  // <input type="month"> envía AAAA-MM.
  period: z
    .string({ error: 'Indica el mes' })
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Indica el mes')
    .transform((m) => `${m}-01`),
  kind: z.enum(['monthly', 'bonus', 'settlement']).default('monthly'),
  netAmount: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : spanishAmount(v)),
    decimalString({ scale: 2, sign: 'non-negative' }).optional(),
  ),
});
export type PayslipInput = z.input<typeof PayslipInput>;

export const toPayslipFile = (fileName: string, content: Uint8Array): StoredFile<PayslipFileType> =>
  toStoredFile(fileName, content, { allowed: ['application/pdf', 'image/jpeg', 'image/png'], what: 'de la nómina', fallbackName: 'nomina.pdf' });

const COLUMNS = (tx: Tx) => tx`
  p.id, p.user_id, u.full_name as user_name, u.email as user_email, uo.employee_code,
  p.period::text, p.kind, p.net_amount::text, p.file_name, p.content_type, p.byte_size,
  p.viewed_at, p.created_at, c.full_name as created_by_name`;

export function createPayrollService(sql: Sql) {
  return {
    /** Las nóminas de quien pregunta, de la más reciente a la más antigua. */
    async mine(ctx: TenantContext): Promise<Payslip[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<Payslip>(await tx`
          select ${COLUMNS(tx)}
          from payslips p
          join users u on u.id = p.user_id
          join user_organizations uo on uo.organization_id = p.organization_id and uo.user_id = p.user_id
          left join users c on c.id = p.created_by
          where p.user_id = ${ctx.userId}
          order by p.period desc, p.kind = 'monthly' desc, p.kind`),
      );
    },

    /** Todas (RRHH). Sin hr.payroll.manage, RLS solo deja ver las propias. */
    async all(ctx: TenantContext, { userId }: { userId?: string } = {}): Promise<Payslip[]> {
      const filter = userId ? z.uuid().parse(userId) : null;
      return withTenant(sql, ctx, async (tx) =>
        asRows<Payslip>(await tx`
          select ${COLUMNS(tx)}
          from payslips p
          join users u on u.id = p.user_id
          join user_organizations uo on uo.organization_id = p.organization_id and uo.user_id = p.user_id
          left join users c on c.id = p.created_by
          where (${filter}::uuid is null or p.user_id = ${filter})
          order by p.period desc, u.full_name, p.kind = 'monthly' desc, p.kind`),
      );
    },

    /** Personas a las que se puede subir nómina: también invitadas que aún no han entrado. */
    async employees(ctx: TenantContext): Promise<PayslipEmployee[]> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) =>
        asRows<PayslipEmployee>(await tx`
          select uo.user_id, coalesce(u.full_name, u.email) as name, u.email, uo.employee_code, uo.status
          from user_organizations uo join users u on u.id = uo.user_id
          where uo.organization_id = ${orgId}
          order by uo.status = 'suspended', coalesce(u.full_name, u.email)`),
      );
    },

    async upload(ctx: TenantContext, raw: unknown, file: StoredFile<PayslipFileType>) {
      const input = PayslipInput.parse(raw);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const [member] = await tx`select 1 from user_organizations where organization_id = ${orgId} and user_id = ${input.userId}`;
        if (!member) throw new DomainError('VALIDATION', 'Esa persona no pertenece a esta sociedad');
        const [existing] = await tx`
          select 1 from payslips where organization_id = ${orgId} and user_id = ${input.userId} and period = ${input.period} and kind = ${input.kind}`;
        if (existing) {
          throw new DomainError('CONFLICT', 'Esa persona ya tiene una nómina de ese tipo para ese mes. Bórrala antes si quieres sustituirla.');
        }
        const [row] = await tx<{ id: string }[]>`
          insert into payslips (organization_id, user_id, period, kind, net_amount, content_type, file_name, byte_size, content)
          values (${orgId}, ${input.userId}, ${input.period}, ${input.kind}, ${input.netAmount ?? null},
                  ${file.contentType}, ${file.fileName}, ${file.content.byteLength},
                  ${Buffer.from(file.content.buffer, file.content.byteOffset, file.content.byteLength)})
          returning id`;
        return row!.id;
      });
    },

    async remove(ctx: TenantContext, id: string) {
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`delete from payslips where id = ${z.uuid().parse(id)} returning id`;
        if (rows.length === 0) throw new DomainError('FORBIDDEN', 'No puedes borrar esta nómina');
      });
    },

    /**
     * El documento. Si quien lo abre es su titular, queda constancia de la
     * primera lectura (RRHH ve «Vista el …»).
     */
    async file(ctx: TenantContext, id: string) {
      const payslipId = z.uuid().parse(id);
      return withTenant(sql, ctx, async (tx) => {
        const [row] = await tx<{ user_id: string; file_name: string; content_type: string; content: Buffer }[]>`
          select user_id, file_name, content_type, content from payslips where id = ${payslipId}`;
        if (!row) throw new DomainError('NOT_FOUND', 'Nómina no encontrada');
        if (row.user_id === ctx.userId) await tx`select app.mark_payslip_viewed(${payslipId})`;
        return { fileName: row.file_name, contentType: row.content_type, content: row.content };
      });
    },
  };
}

export type PayrollService = ReturnType<typeof createPayrollService>;
