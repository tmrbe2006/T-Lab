import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PermissionAction, ResourceScreen, User } from '../../types';

const permissions = vi.hoisted(() => ({
  getPermissionsFor: vi.fn(),
}));

vi.mock('../../auth/auth.service', () => ({
  authService: { getPermissionsFor: permissions.getPermissionsFor },
}));
vi.mock('../../components/common', () => ({ showToast: vi.fn() }));
vi.mock('../../i18n', () => ({ i18n: { bi: (ar: string) => ar } }));

import { can } from '../../guards/permission.guard';

const user = (role: User['role'], active = true) =>
  ({ id: 'test', username: 'test', role, active } as User);

describe('RBAC saved role matrix', () => {
  beforeEach(() => permissions.getPermissionsFor.mockReset());

  it('denies anonymous, inactive, missing rows and missing actions by default', () => {
    expect(can(null, 'view', 'patients')).toBe(false);
    expect(can(user('Receptionist', false), 'view', 'patients')).toBe(false);
    permissions.getPermissionsFor.mockReturnValue(undefined);
    expect(can(user('Receptionist'), 'view', 'patients')).toBe(false);
    permissions.getPermissionsFor.mockReturnValue({ view: true });
    expect(can(user('Receptionist'), 'edit', 'patients')).toBe(false);
  });

  it('honors each stored action rather than enabling entire screens', () => {
    permissions.getPermissionsFor.mockImplementation((role: string, resource: string) =>
      role === 'Receptionist' && resource === 'patients'
        ? { view: true, add: true, edit: false, delete: false, print: false }
        : undefined
    );
    expect(can(user('Receptionist'), 'view', 'patients')).toBe(true);
    expect(can(user('Receptionist'), 'add', 'patients')).toBe(true);
    expect(can(user('Receptionist'), 'edit', 'patients')).toBe(false);
    expect(can(user('Receptionist'), 'delete', 'patients')).toBe(false);
    expect(can(user('Receptionist'), 'view', 'invoices')).toBe(false);
    expect(can(user('Receptionist'), 'approve', 'results')).toBe(false);
    expect(can(user('Receptionist'), 'edit', 'microbiology')).toBe(false);
  });

  it('restricts permission administration to developer and owner', () => {
    for (const action of ['view', 'edit', 'managePermissions', 'print'] as PermissionAction[]) {
      expect(can(user('Developer'), action, 'permissions')).toBe(true);
      expect(can(user('Owner'), action, 'permissions')).toBe(true);
      expect(can(user('Accountant'), action, 'permissions')).toBe(false);
    }
    expect(can(user('Owner'), 'delete', 'permissions')).toBe(false);
  });

  it('reserves settings for developer, and allows owner regular operations', () => {
    expect(can(user('Developer'), 'edit', 'settings')).toBe(true);
    expect(can(user('Owner'), 'edit', 'settings')).toBe(false);
    expect(can(user('Owner'), 'add', 'patients')).toBe(true);
    expect(can(user('Technician'), 'view', 'settings')).toBe(false);
  });
});
