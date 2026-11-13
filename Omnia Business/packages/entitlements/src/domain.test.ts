import { describe, expect, it } from 'vitest';
import { SetFeatureInput, featureLineage, featureTree, hasFeature, isPermissionEntitled, permissionFeature } from './domain';

const catalog = [
  { code: 'base', permissionGates: [] },
  { code: 'sales', permissionGates: ['sales'] },
  { code: 'sales.pos', permissionGates: ['pos'] },
  { code: 'sales.pos.staff_cards', permissionGates: ['staff_cards'] },
  { code: 'hr', permissionGates: [] },
  { code: 'hr.payroll', permissionGates: ['hr.payroll'] },
  { code: 'zeta', permissionGates: ['sales.special'] },
];

describe('featureLineage / hasFeature', () => {
  it('desglosa la cadena de padres', () => {
    expect(featureLineage('sales.pos.staff_cards')).toEqual(['sales', 'sales.pos', 'sales.pos.staff_cards']);
  });
  it('exige el módulo y todos sus padres', () => {
    expect(hasFeature(['sales', 'sales.pos'], 'sales.pos')).toBe(true);
    expect(hasFeature(['sales.pos'], 'sales.pos')).toBe(false);
    expect(hasFeature(new Set(['sales']), 'sales.pos')).toBe(false);
  });
});

describe('permissionFeature (réplica de app.permission_feature)', () => {
  it('cubre por prefijo con punto, no por subcadena', () => {
    expect(permissionFeature(catalog, 'sales.read')).toBe('sales');
    expect(permissionFeature(catalog, 'sales')).toBe('sales');
    expect(permissionFeature(catalog, 'salesman.read')).toBeNull();
    expect(permissionFeature(catalog, 'pos.use')).toBe('sales.pos');
  });
  it('gana el prefijo más largo', () => {
    expect(permissionFeature(catalog, 'sales.special.read')).toBe('zeta');
    expect(permissionFeature(catalog, 'hr.payroll.manage')).toBe('hr.payroll');
    expect(permissionFeature(catalog, 'hr.time.self')).toBeNull();
  });
  it('los permisos sin módulo (miembros, *) siempre se conceden', () => {
    expect(isPermissionEntitled(catalog, [], 'members.read')).toBe(true);
    expect(isPermissionEntitled(catalog, [], '*')).toBe(true);
    expect(isPermissionEntitled(catalog, ['sales'], 'pos.use')).toBe(false);
    expect(isPermissionEntitled(catalog, ['sales', 'sales.pos'], 'pos.use')).toBe(true);
  });
});

describe('featureTree', () => {
  it('anida y ordena', () => {
    const tree = featureTree([
      { code: 'sales.pos', parentCode: 'sales', sortOrder: 2 },
      { code: 'sales', parentCode: null, sortOrder: 1 },
      { code: 'base', parentCode: null, sortOrder: 0 },
    ]);
    expect(tree.map((n) => n.feature.code)).toEqual(['base', 'sales']);
    expect(tree[1]!.children.map((n) => n.feature.code)).toEqual(['sales.pos']);
  });
});

describe('SetFeatureInput', () => {
  it('rechaza claves desconocidas y caducidades pasadas', () => {
    expect(SetFeatureInput.safeParse({ isActive: true, organizationId: 'x' }).success).toBe(false);
    expect(SetFeatureInput.safeParse({ isActive: true, expiresAt: '2000-01-01T00:00:00Z' }).success).toBe(false);
    expect(SetFeatureInput.safeParse({ isActive: false, expiresAt: null }).success).toBe(true);
    expect(SetFeatureInput.safeParse({ isActive: true, expiresAt: '2999-01-01T00:00:00+01:00' }).success).toBe(true);
  });
});
