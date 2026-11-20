import { describe, expect, it, vi } from 'vitest';
import {
  BRANCH_ACTIONS, BRANCH_RESOURCES, validateMatrix,
  readBranchPermissions, saveBranchPermissions, ownBranchPermissions,
} from '../../../server/branch-user-permissions';
import type { BranchDatabase } from '../../../server/branch-service';
import type { BranchPrincipal } from '../../../server/branch-access';

const owner: BranchPrincipal = {userId:'owner',role:'Owner',active:true,assignedBranchIds:new Set()};
const receptionist: BranchPrincipal = {userId:'staff',role:'Receptionist',active:true,assignedBranchIds:new Set(['branch_main'])};
const matrix = () => BRANCH_RESOURCES.map((resource) => ({
  resource,
  actions: Object.fromEntries(BRANCH_ACTIONS.map((a) => [a, a === 'view'])) as Record<string, boolean>,
}));
const fake = (allowed = true) => {
  const execute = vi.fn(async (sql:string, _params?:unknown[]) =>
    sql.includes('SELECT 1 AS allowed') ? [[...(allowed ? [{allowed:1}] : [])],[]] : [[],[]]);
  return {execute} as BranchDatabase & {execute:typeof execute};
};

describe('user-specific branch permissions', () => {
  it('accepts a full 38-screen, 16-action boolean matrix', () => {
    expect(BRANCH_RESOURCES).toHaveLength(38);
    expect(BRANCH_ACTIONS).toHaveLength(16);
    expect(validateMatrix(matrix())).toHaveLength(38);
    expect(() => validateMatrix(matrix().slice(1))).toThrow();
    const unsafe = matrix();
    unsafe[0].actions.delete = 'yes' as unknown as boolean;
    expect(() => validateMatrix(unsafe)).toThrow();
  });

  it('denies staff and inactive administrators the ability to change other accounts', async () => {
    const db = fake();
    await expect(saveBranchPermissions(db, receptionist, 'staff', 'branch_main', matrix())).rejects.toThrow('FORBIDDEN');
    await expect(saveBranchPermissions(db, {...owner, active:false}, 'staff', 'branch_main', matrix())).rejects.toThrow('FORBIDDEN');
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('cannot assign rights to an unassigned user and branch combination', async () => {
    const db = fake(false);
    await expect(saveBranchPermissions(db, owner, 'staff', 'branch_2', matrix())).rejects.toThrow('FORBIDDEN');
    expect(db.execute).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_branch_permissions'),expect.anything());
  });

  it('writes all rows against exactly the selected user+branch pair', async () => {
    const db = fake();
    await saveBranchPermissions(db, owner, 'staff', 'branch_main', matrix());
    const writes = db.execute.mock.calls.filter((args) => args[0].includes('INSERT INTO user_branch_permissions'));
    expect(writes).toHaveLength(38);
    for (const write of writes) {
      expect(write[1]?.[0]).toBe('staff');
      expect(write[1]?.[1]).toBe('branch_main');
      expect(write[1]?.[4]).toBe('owner');
    }
  });

  it('only loads the requested branch permissions and never grants malformed rows', async () => {
    const db: BranchDatabase = {
      execute: vi.fn(async (_sql: string, _params?: unknown[]): Promise<[unknown, unknown]> => [[
        {resource:'patients',actions_json:'{"view":true,"delete":false}'},
        {resource:'requests',actions_json:'bad json'},
      ],[]]),
    };
    const rows = await readBranchPermissions(db, owner, 'staff', 'branch_main');
    expect(rows[0].actions.view).toBe(true);
    const own = await ownBranchPermissions(db, 'staff', 'branch_main');
    expect(own[0].actions.view).toBe(true);
    expect(own[0].actions.delete).toBe(false);
    expect(own[1].actions.view).toBe(false);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id=? AND branch_id=?'),['staff','branch_main']);
  });
});
