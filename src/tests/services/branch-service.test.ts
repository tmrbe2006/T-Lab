import { describe, expect, it, vi } from 'vitest';
import {
  createBranch, getAccessibleBranch, listAccessibleBranches,
  setUserBranchAssignment, type BranchDatabase,
} from '../../../server/branch-service';
import type { BranchPrincipal } from '../../../server/branch-access';

const admin: BranchPrincipal = { userId: 'owner', role: 'Owner', active: true, assignedBranchIds: new Set() };
const staff: BranchPrincipal = { userId: 'staff', role: 'Receptionist', active: true, assignedBranchIds: new Set(['branch_main']) };

function fakeDb(rows: unknown[] = []) {
  const execute = vi.fn().mockResolvedValue([rows, []]);
  return { execute } as BranchDatabase & { execute: typeof execute };
}

describe('branch database service (not yet exposed as API)', () => {
  it('refuses to query when staff has no branch assignment', async () => {
    const db = fakeDb();
    const result = await listAccessibleBranches(db, { ...staff, assignedBranchIds: new Set() });
    expect(result).toEqual([]);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('scopes staff list by assigned branch IDs using SQL placeholders', async () => {
    const db = fakeDb([{ id: 'branch_main', code: 'BR-001', name_ar: 'Main', name_en: 'Main', active: 1, is_main: 1 }]);
    const result = await listAccessibleBranches(db, staff);
    expect(result[0].branchId).toBe('branch_main');
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('id IN (?)'), ['branch_main']);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('active = 1'), ['branch_main']);
    await expect(getAccessibleBranch(db, staff, 'branch_2')).rejects.toThrow('INVALID_BRANCH');
  });

  it('allows admins to list active branches but denies inactive accounts', async () => {
    const db = fakeDb([]);
    await listAccessibleBranches(db, admin);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('FROM branches WHERE active = 1'), []);
    await expect(listAccessibleBranches(db, { ...admin, active: false })).rejects.toThrow('FORBIDDEN');
  });

  it('only the Developer can create branches with automatically generated sequential codes', async () => {
    const developer: BranchPrincipal = { ...admin, role: 'Developer' };
    const db = fakeDb();
    db.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('COALESCE(MAX')) return [[{ n: 1 }], []];
      if (sql.includes('LAST_INSERT_ID() AS n')) return [[{ n: 2 }], []];
      return [[], []];
    });
    await expect(createBranch(db, staff, { id: 'branch_2', nameAr: 'Branch 2' })).rejects.toThrow('FORBIDDEN');
    await expect(createBranch(db, admin, { id: 'branch_2', nameAr: 'Branch 2' })).rejects.toThrow('FORBIDDEN');
    expect(db.execute).not.toHaveBeenCalled();
    const generatedCode = await createBranch(db, developer, { id: 'branch_2', nameAr: 'Branch 2' });
    expect(generatedCode).toBe('BR-002');
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO branches'), ['branch_2', 'BR-002', 'Branch 2', null]);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('LAST_INSERT_ID'), expect.any(Array));
  });

  it('only assigns existing active users to existing active branches and never overwrites previous assignments', async () => {
    const db = fakeDb();
    await expect(setUserBranchAssignment(db, staff, 'staff', 'branch_2')).rejects.toThrow('FORBIDDEN');
    await expect(setUserBranchAssignment(db, admin, 'staff', "branch_2' OR 1=1")).rejects.toThrow('INVALID_BRANCH');
    await setUserBranchAssignment(db, admin, 'staff', 'branch_2');
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('JOIN branches b ON b.id = ? AND b.active = 1'), ['branch_2', 'staff']);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE'), ['branch_2', 'staff']);
  });
});
