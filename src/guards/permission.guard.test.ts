import { describe, expect, it, vi } from 'vitest';

const getPermissionsFor = vi.fn();
vi.mock('../auth/auth.service', () => ({
  authService: { getPermissionsFor, getCurrentUser: vi.fn(), logAudit: vi.fn() },
}));
vi.mock('../components/common', () => ({ showToast: vi.fn() }));
vi.mock('../i18n', () => ({ i18n: { bi: (ar: string) => ar } }));

import { can } from './permission.guard';
import type { User } from '../types';

const user = (role: User['role']): User =>
  ({ id: 'test', username: 'test', role, active: true } as User);

describe('RBAC fail closed (client-side defense in depth)', () => {
  it('rejects guests and inactive users', () => {
    expect(can(null, 'view', 'patients')).toBe(false);
    expect(can({ ...user('Doctor'), active: false }, 'view', 'patients')).toBe(false);
  });

  it('rejects missing and explicitly denied permissions', () => {
    getPermissionsFor.mockReturnValue(undefined);
    expect(can(user('Receptionist'), 'delete', 'patients')).toBe(false);
    getPermissionsFor.mockReturnValue({ view: true, delete: false });
    expect(can(user('Receptionist'), 'view', 'patients')).toBe(true);
    expect(can(user('Receptionist'), 'delete', 'patients')).toBe(false);
  });

  it('does not override the permission matrix for medical approval', () => {
    getPermissionsFor.mockReturnValue({ view: true, approve: false });
    expect(can(user('Technician'), 'approve', 'resultReview')).toBe(false);
  });

  it('reserves settings and permissions management for developer', () => {
    getPermissionsFor.mockReturnValue({ view: true, managePermissions: true });
    expect(can(user('Owner'), 'view', 'settings')).toBe(false);
    expect(can(user('Doctor'), 'managePermissions', 'patients')).toBe(false);
    expect(can(user('Receptionist'), 'view', 'users')).toBe(false);
    expect(can(user('Developer'), 'view', 'settings')).toBe(true);
  });
});
