import { describe, it, expect } from 'vitest';
import {
  branchPredicate,
  requireBranchAccess,
  requireRecordBranch,
  validBranchId,
  type BranchPrincipal,
  type BranchScope,
} from '../../../server/branch-access';

const branches: BranchScope[] = [
  { branchId: 'branch_main', active: true, isMain: true },
  { branchId: 'branch_2', active: true, isMain: false },
  { branchId: 'branch_3', active: false, isMain: false },
];
const staff: BranchPrincipal = {
  userId: 'usr_staff', role: 'Receptionist', active: true,
  assignedBranchIds: new Set(['branch_main']),
};
const owner: BranchPrincipal = {
  userId: 'usr_owner', role: 'Owner', active: true,
  assignedBranchIds: new Set(),
};

describe('branch isolation policy (deny by default)', () => {
  it('validates explicit branch IDs, never accepting SQL fragments', () => {
    expect(validBranchId('branch_main')).toBe(true);
    expect(validBranchId('x'.repeat(65))).toBe(false);
    expect(validBranchId('branch_main OR 1=1')).toBe(false);
    expect(validBranchId(undefined)).toBe(false);
  });

  it('rejects missing or inactive identities', () => {
    expect(() => requireBranchAccess(null, 'branch_main', branches)).toThrow('FORBIDDEN');
    expect(() => requireBranchAccess({ ...staff, active: false }, 'branch_main', branches)).toThrow('FORBIDDEN');
  });

  it('allows an assigned branch but rejects a different or missing branch', () => {
    expect(requireBranchAccess(staff, 'branch_main', branches).branchId).toBe('branch_main');
    expect(() => requireBranchAccess(staff, 'branch_2', branches)).toThrow('FORBIDDEN');
    expect(() => requireBranchAccess(staff, '', branches)).toThrow('INVALID_BRANCH');
  });

  it('never permits access to inactive branches, even for owners', () => {
    expect(requireBranchAccess(owner, 'branch_2', branches).branchId).toBe('branch_2');
    expect(() => requireBranchAccess(owner, 'branch_3', branches)).toThrow('INACTIVE_BRANCH');
  });

  it('refuses cross-branch records even when the selected branch is authorized', () => {
    requireRecordBranch('branch_main', requireBranchAccess(staff, 'branch_main', branches).branchId);
    expect(() => requireRecordBranch('branch_2', 'branch_main')).toThrow('FORBIDDEN');
    expect(() => requireRecordBranch(null, 'branch_main')).toThrow('FORBIDDEN');
  });

  it('requires an SQL branch predicate and rejects dangerous table aliases', () => {
    expect(branchPredicate()).toBe('`branch_id` = ?');
    expect(branchPredicate('lr')).toBe('`lr`.`branch_id` = ?');
    expect(() => branchPredicate('lr;DROP')).toThrow('INVALID_BRANCH');
  });
});
