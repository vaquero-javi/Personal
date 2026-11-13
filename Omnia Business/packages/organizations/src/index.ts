import { z } from 'zod';
import {
  CustomFieldEntity,
  DomainError,
  checkbox,
  optionalText,
  optionalUuid,
  requiredText,
  singleOrganization,
  type TenantContext,
} from '@omnia/core';
import { asRow, asRows, withTenant, withUser, type Sql } from '@omnia/db';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Uno de los cuatro colores de la casa o uno elegido en hexadecimal (#rrggbb). */
export type SpineColor = 'red' | 'blue' | 'yellow' | 'green' | `#${string}`;

export interface Membership {
  organizationId: string;
  slug: string;
  legalName: string;
  tradeName: string | null;
  taxId: string;
  spineColor: SpineColor;
  parentId: string | null;
  roleKey: string;
  roleName: string;
  permissions: string[];
  isDefault: boolean;
  /** Módulos contratados y efectivos de la sociedad (app.org_entitled_features). */
  features: string[];
  /** 'holding': de él cuelgan sociedades (parentId). 'company': sociedad. */
  kind: OrganizationKind;
}

export type OrganizationKind = 'holding' | 'company';

/** Empresa: negocio o local dentro de una sociedad (comparte NIF y facturación). */
export interface Establishment {
  id: string;
  name: string;
  isActive: boolean;
  warehouseCount: number;
  warehouseNames: string[];
  memberIds: string[];
  memberNames: string[];
}

export interface Organization {
  id: string;
  slug: string;
  legalName: string;
  tradeName: string | null;
  taxId: string;
  countryCode: string;
  fiscalRegime: string;
  spineColor: SpineColor;
  fiscalAddress: { line?: string; postalCode?: string; city?: string; province?: string };
  iban: string | null;
  kind: OrganizationKind;
  parentId: string | null;
}

export interface Member {
  userId: string;
  email: string;
  fullName: string | null;
  roleId: string;
  roleName: string;
  roleKey: string;
  status: 'invited' | 'active' | 'suspended';
  employeeCode: string | null;
}

export interface Role {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
}

export interface Permission {
  code: string;
  module: string;
  description: string;
}

export interface CustomField {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  label: string;
  dataType: string;
  isRequired: boolean;
  options: string[];
}

/** Réplica en cliente de la regla de app.authorized_org_ids (solo para ocultar UI). */
export function hasPermission(permissions: readonly string[], code: string): boolean {
  return permissions.includes('*') || permissions.includes(`${code.split('.')[0]}.*`) || permissions.includes(code);
}

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

export const FiscalRegime = z.enum(['verifactu', 'ticketbai_araba', 'ticketbai_bizkaia', 'ticketbai_gipuzkoa', 'sii', 'none']);

export const UpdateOrganizationInput = z.object({
  legalName: requiredText(200),
  tradeName: optionalText(200),
  taxId: requiredText(20),
  fiscalRegime: FiscalRegime,
  spineColor: z.union([
    z.enum(['red', 'blue', 'yellow', 'green']),
    z.string().trim().toLowerCase().regex(/^#[0-9a-f]{6}$/, 'Color no válido'),
  ]),
  addressLine: optionalText(200),
  postalCode: optionalText(10),
  city: optionalText(100),
  province: optionalText(100),
  iban: z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/\s+/g, '').toUpperCase() || undefined : v),
    z.string().regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/, 'IBAN no válido (p. ej. ES91 2100 0418 4502 0005 1332)').optional(),
  ),
});

export const CreateOrganizationInput = z.object({
  kind: z.enum(['holding', 'company']).default('company'),
  /** Holding del que cuelga (solo sociedades). */
  parentId: optionalUuid(),
  legalName: requiredText(200),
  taxId: requiredText(20),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'Solo minúsculas, números y guiones (3–63 caracteres)'),
});

export const SetParentInput = z.object({ parentId: optionalUuid() });

export const EstablishmentMemberInput = z.object({
  establishmentId: z.uuid(),
  userId: z.uuid('Elige a la persona'),
  assigned: checkbox(),
});

export const EstablishmentInput = z.object({
  id: optionalUuid(),
  name: requiredText(80),
  isActive: checkbox().default(true),
});

export const AddMemberInput = z.object({
  email: z.email('Email no válido').trim(),
  roleId: z.uuid('Elige un rol'),
  employeeCode: optionalText(30),
});

export const UpdateMemberInput = z.object({
  userId: z.uuid(),
  roleId: z.uuid(),
  status: z.enum(['active', 'suspended']),
});

export const SaveRoleInput = z.object({
  id: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  name: requiredText(80),
  permissions: z.array(z.string()).default([]),
});

export const CreateCustomFieldInput = z.object({
  entity: CustomFieldEntity,
  label: requiredText(80),
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,62}$/, 'Minúsculas, números y _; empieza por letra'),
  dataType: z.enum(['text', 'number', 'boolean', 'date', 'select', 'multiselect']),
  isRequired: z.boolean().default(false),
  options: z.array(z.string().trim().min(1)).default([]),
});

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

export function createOrganizationsService(sql: Sql) {
  return {
    async me(userId: string): Promise<{ id: string; email: string; fullName: string | null }> {
      return withUser(sql, userId, async (tx) => {
        const me = asRow<{ id: string; email: string; fullName: string | null }>(
          await tx`select id, email, full_name from users where id = ${userId}`,
        );
        if (!me) throw new DomainError('UNAUTHENTICATED', 'Tu cuenta no tiene perfil en Omnia');
        return me;
      });
    },

    /** Empresas activas de todas mis sociedades (para el árbol de la barra lateral). */
    async myEstablishmentsAll(userId: string): Promise<{ organizationId: string; id: string; name: string }[]> {
      return withUser(sql, userId, async (tx) =>
        asRows<{ organizationId: string; id: string; name: string }>(await tx`select * from app.my_establishments()`),
      );
    },

    async memberships(userId: string): Promise<Membership[]> {
      return withUser(sql, userId, async (tx) => asRows<Membership>(await tx`select * from app.my_memberships()`));
    },

    async create(userId: string, raw: unknown): Promise<string> {
      const input = CreateOrganizationInput.parse(raw);
      if (input.kind === 'holding' && input.parentId) throw new DomainError('VALIDATION', 'Un holding no puede depender de otra sociedad');
      return withUser(sql, userId, async (tx) => {
        const [row] =
          input.kind === 'holding'
            ? await tx<{ id: string }[]>`select app.create_holding(${input.slug}, ${input.legalName}, ${input.taxId}) as id`
            : await tx<{ id: string }[]>`
                select app.create_organization(${input.slug}, ${input.legalName}, ${input.taxId}, ${input.parentId ?? null}::uuid) as id`;
        return row!.id;
      });
    },

    /** Mete o saca la sociedad activa de un holding (hay que gestionar las dos). */
    async setParent(ctx: TenantContext, raw: unknown) {
      const { parentId } = SetParentInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withUser(sql, ctx.userId, (tx) => tx`select app.set_organization_parent(${orgId}, ${parentId ?? null}::uuid)`);
    },

    // ------------------------------------------------------------- empresas (locales)

    async establishments(ctx: TenantContext): Promise<Establishment[]> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) =>
        asRows<Establishment>(await tx`
          select e.id, e.name, e.is_active,
                 (select count(*)::int from warehouses w where w.organization_id = e.organization_id and w.establishment_id = e.id) as warehouse_count,
                 array(select w.name from warehouses w where w.organization_id = e.organization_id and w.establishment_id = e.id order by w.name) as warehouse_names,
                 array(select m.user_id from establishment_members m join users u on u.id = m.user_id
                       where m.establishment_id = e.id order by u.full_name) as member_ids,
                 array(select coalesce(u.full_name, u.email) from establishment_members m join users u on u.id = m.user_id
                       where m.establishment_id = e.id order by u.full_name) as member_names
          from establishments e
          where e.organization_id = ${orgId}
          order by e.is_active desc, e.name`),
      );
    },

    async saveEstablishment(ctx: TenantContext, raw: unknown): Promise<string> {
      const input = EstablishmentInput.parse(raw);
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        if (input.id) {
          const rows = await tx<{ id: string }[]>`
            update establishments set name = ${input.name}, is_active = ${input.isActive}
            where id = ${input.id} and organization_id = ${orgId} returning id`;
          if (rows.length === 0) throw new DomainError('NOT_FOUND', 'Empresa no encontrada');
          return rows[0]!.id;
        }
        const [row] = await tx<{ id: string }[]>`
          insert into establishments (organization_id, name) values (${orgId}, ${input.name}) returning id`;
        return row!.id;
      });
    },

    /** Asigna o quita a una persona de una empresa (members.manage). */
    async setEstablishmentMember(ctx: TenantContext, raw: unknown) {
      const input = EstablishmentMemberInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, (tx) =>
        input.assigned
          ? tx`insert into establishment_members (organization_id, establishment_id, user_id)
               values (${orgId}, ${input.establishmentId}, ${input.userId}) on conflict do nothing`
          : tx`delete from establishment_members
               where organization_id = ${orgId} and establishment_id = ${input.establishmentId} and user_id = ${input.userId}`,
      );
    },

    /** Empresas activas en las que trabaja la persona de la sesión. */
    async myEstablishments(ctx: TenantContext): Promise<{ id: string; name: string }[]> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) =>
        asRows<{ id: string; name: string }>(await tx`
          select e.id, e.name from establishment_members m join establishments e on e.id = m.establishment_id
          where m.organization_id = ${orgId} and m.user_id = ${ctx.userId} and e.is_active order by e.name`),
      );
    },

    /** Borra la empresa; sus almacenes se quedan en la sociedad, sin empresa. */
    async deleteEstablishment(ctx: TenantContext, id: string) {
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        const [used] = await tx`select 1 from time_entries where organization_id = ${orgId} and establishment_id = ${z.uuid().parse(id)} limit 1`;
        // Los fichajes son registros legales y llevan su local: la empresa se desactiva, no se borra.
        if (used) throw new DomainError('INVALID_STATE', 'Esta empresa tiene fichajes registrados: desactívala en lugar de borrarla');
        const rows = await tx`delete from establishments where id = ${id} and organization_id = ${orgId} returning id`;
        if (rows.length === 0) throw new DomainError('NOT_FOUND', 'Empresa no encontrada');
      });
    },

    async get(ctx: TenantContext): Promise<Organization> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) => {
        const org = asRow<Organization>(await tx`
          select id, slug, legal_name, trade_name, tax_id, country_code, fiscal_regime, spine_color, fiscal_address, iban, kind, parent_id
          from organizations where id = ${orgId}`);
        if (!org) throw new DomainError('NOT_FOUND', 'Organización no encontrada');
        return org;
      });
    },

    async update(ctx: TenantContext, raw: unknown) {
      const input = UpdateOrganizationInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`
          update organizations
          set legal_name = ${input.legalName}, trade_name = ${input.tradeName ?? null}, tax_id = ${input.taxId},
              fiscal_regime = ${input.fiscalRegime}, spine_color = ${input.spineColor},
              fiscal_address = ${tx.json(Object.fromEntries(
                Object.entries({ line: input.addressLine, postalCode: input.postalCode, city: input.city, province: input.province }).filter(([, v]) => v),
              ) as Record<string, string>)},
              iban = ${input.iban ?? null}
          where id = ${orgId}
          returning id`;
        if (rows.length === 0) throw new DomainError('FORBIDDEN', 'No puedes editar los datos de esta sociedad');
      });
    },

    async members(ctx: TenantContext): Promise<Member[]> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) =>
        asRows<Member>(await tx`
          select uo.user_id, u.email, u.full_name, uo.role_id, r.name as role_name, r.key as role_key, uo.status, uo.employee_code
          from user_organizations uo
          join users u on u.id = uo.user_id
          join roles r on r.id = uo.role_id
          where uo.organization_id = ${orgId}
          order by uo.status, u.full_name`),
      );
    },

    async addMember(ctx: TenantContext, raw: unknown) {
      const input = AddMemberInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        const [user] = await tx<{ id: string }[]>`select id from app.find_user_by_email(${input.email})`;
        if (!user) {
          throw new DomainError('VALIDATION', 'No hay ninguna cuenta con ese email. La persona debe registrarse primero.');
        }
        await tx`
          insert into user_organizations (user_id, organization_id, role_id, employee_code)
          values (${user.id}, ${orgId}, ${input.roleId}, ${input.employeeCode ?? null})`;
      });
    },

    async updateMember(ctx: TenantContext, raw: unknown) {
      const input = UpdateMemberInput.parse(raw);
      const orgId = singleOrganization(ctx);
      if (input.userId === ctx.userId && input.status === 'suspended') {
        throw new DomainError('VALIDATION', 'No puedes suspenderte a ti mismo');
      }
      await withTenant(sql, ctx, async (tx) => {
        const rows = await tx`
          update user_organizations set role_id = ${input.roleId}, status = ${input.status}
          where organization_id = ${orgId} and user_id = ${input.userId}
          returning user_id`;
        if (rows.length === 0) throw new DomainError('FORBIDDEN', 'No puedes gestionar miembros en esta sociedad');
      });
    },

    async roles(ctx: TenantContext): Promise<Role[]> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) =>
        asRows<Role>(await tx`
          select r.id, r.key, r.name, r.is_system,
                 coalesce(array_agg(distinct rp.permission_code) filter (where rp.permission_code is not null), '{}') as permissions,
                 (select count(*)::int from user_organizations uo where uo.role_id = r.id) as member_count
          from roles r
          left join role_permissions rp on rp.role_id = r.id
          where r.organization_id = ${orgId}
          group by r.id
          order by r.is_system desc, r.name`),
      );
    },

    async permissionCatalog(ctx: TenantContext): Promise<Permission[]> {
      return withTenant(sql, ctx, async (tx) =>
        asRows<Permission>(await tx`select code, module, description from permissions where code <> '*' order by module, code`),
      );
    },

    async saveRole(ctx: TenantContext, raw: unknown) {
      const input = SaveRoleInput.parse(raw);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        let roleId = input.id;
        if (roleId) {
          const rows = await tx`update roles set name = ${input.name} where id = ${roleId} and organization_id = ${orgId} returning id`;
          if (rows.length === 0) throw new DomainError('FORBIDDEN', 'Este rol no se puede editar');
          await tx`delete from role_permissions where role_id = ${roleId}`;
        } else {
          const key = input.name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .replace(/^(\d)/, 'r_$1');
          const [row] = await tx<{ id: string }[]>`
            insert into roles (organization_id, key, name) values (${orgId}, ${key || 'rol'}, ${input.name}) returning id`;
          roleId = row!.id;
        }
        const permissions = input.permissions.filter((p) => p !== '*');
        if (permissions.length > 0) {
          await tx`
            insert into role_permissions ${tx(
              permissions.map((code) => ({ organization_id: orgId, role_id: roleId, permission_code: code })),
              'organization_id',
              'role_id',
              'permission_code',
            )}`;
        }
      });
    },

    /**
     * Borra un rol propio de la sociedad (permiso 'roles.delete'; la RLS lo
     * impone). Los de sistema no se borran. Si alguien tiene el rol, se pasa
     * antes a `replacementId` en la misma transacción: eso es cambiar roles de
     * miembros y exige además 'members.manage', y el destino no puede ser un rol
     * de sistema. Sus permisos y su política de descuento se borran con él.
     */
    async deleteRole(ctx: TenantContext, id: string, replacementId?: string | null) {
      const roleId = z.uuid().parse(id);
      const orgId = singleOrganization(ctx);
      await withTenant(sql, ctx, async (tx) => {
        const [role] = await tx<{ is_system: boolean; members: number; can_delete: boolean; can_move: boolean }[]>`
          select r.is_system,
                 (select count(*)::int from user_organizations uo where uo.role_id = r.id) as members,
                 app.has_permission(${orgId}, 'roles.delete') as can_delete,
                 app.has_permission(${orgId}, 'members.manage') as can_move
          from roles r where r.id = ${roleId} and r.organization_id = ${orgId}`;
        if (!role) throw new DomainError('NOT_FOUND', 'El rol ya no existe');
        if (role.is_system) throw new DomainError('FORBIDDEN', 'El rol de propietario no se puede eliminar');
        if (!role.can_delete) throw new DomainError('FORBIDDEN', 'Tu rol no incluye el permiso «Eliminar roles»');

        if (role.members > 0) {
          if (!role.can_move) {
            throw new DomainError('FORBIDDEN', 'Este rol tiene personas: para pasarlas a otro rol necesitas también el permiso «Invitar, suspender y cambiar roles»');
          }
          const target = replacementId ? z.uuid().parse(replacementId) : null;
          if (!target || target === roleId) throw new DomainError('VALIDATION', 'Elige a qué rol pasan las personas que tienen este');
          const [dest] = await tx<{ is_system: boolean }[]>`select is_system from roles where id = ${target} and organization_id = ${orgId}`;
          if (!dest) throw new DomainError('VALIDATION', 'El rol de destino ya no existe');
          if (dest.is_system) throw new DomainError('FORBIDDEN', 'No se puede pasar a nadie al rol de propietario desde aquí');
          await tx`update user_organizations set role_id = ${target} where organization_id = ${orgId} and role_id = ${roleId}`;
        }

        const rows = await tx`delete from roles where id = ${roleId} and organization_id = ${orgId} returning id`;
        if (rows.length === 0) throw new DomainError('FORBIDDEN', 'Tu rol no incluye el permiso «Eliminar roles»');
      });
    },

    async customFields(ctx: TenantContext): Promise<CustomField[]> {
      const orgId = singleOrganization(ctx);
      return withTenant(sql, ctx, async (tx) =>
        asRows<CustomField>(await tx`
          select id, entity, key, label, data_type, is_required, options
          from custom_field_definitions where organization_id = ${orgId}
          order by entity, position, key`),
      );
    },

    async createCustomField(ctx: TenantContext, raw: unknown) {
      const input = CreateCustomFieldInput.parse(raw);
      const orgId = singleOrganization(ctx);
      if ((input.dataType === 'select' || input.dataType === 'multiselect') && input.options.length === 0) {
        throw new DomainError('VALIDATION', 'Añade al menos una opción');
      }
      await withTenant(sql, ctx, (tx) => tx`
        insert into custom_field_definitions (organization_id, entity, key, label, data_type, is_required, options)
        values (${orgId}, ${input.entity}, ${input.key}, ${input.label}, ${input.dataType}, ${input.isRequired}, ${tx.json(input.options)})`);
    },

    async deleteCustomField(ctx: TenantContext, id: string) {
      await withTenant(sql, ctx, (tx) => tx`delete from custom_field_definitions where id = ${z.uuid().parse(id)}`);
    },
  };
}

export type OrganizationsService = ReturnType<typeof createOrganizationsService>;
