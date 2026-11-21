import { BranchAccessError, validBranchId, type BranchPrincipal } from './branch-access';
import type { BranchDatabase } from './branch-service';

// Strict known operations; never execute SQL with a client-supplied column/table.
export const BRANCH_ACTIONS = [
  'view', 'add', 'edit', 'delete', 'print', 'export', 'approve', 'cancel',
  'discount', 'editPrices', 'closeDay', 'reopenResult', 'managePermissions',
  'addPayment', 'payCommission', 'addJournalEntry',
] as const;
export const BRANCH_RESOURCES = [
  'dashboard', 'patients', 'doctors', 'doctorSpecialties', 'employees', 'users',
  'permissions', 'branches', 'tests', 'scientificDepartments', 'sampleTubes',
  'testParameters', 'requests', 'samples', 'results', 'aiHub', 'bloodFilmAi',
  'urineMicroscopyAi', 'stoolMicroscopyAi', 'culturePlateAi', 'microbiology',
  'qualityControl', 'homeVisits', 'corporateContracts',
  'resultReview', 'reports', 'invoices', 'payments', 'accounts', 'journalEntries',
  'cashbox', 'expenses', 'commissions', 'settings', 'printing', 'inventory',
  'purchases', 'erpAccounting',
] as const;
export type BranchPermissionRow = {
  resource: string;
  actions: Record<string, boolean>;
};

function requireManager(principal: BranchPrincipal | null | undefined): asserts principal is BranchPrincipal {
  if (!principal?.active || !principal.userId ||
      (principal.role !== 'Developer' && principal.role !== 'Owner')) {
    throw new BranchAccessError('FORBIDDEN');
  }
}

export function validateMatrix(rows: unknown): BranchPermissionRow[] {
  if (!Array.isArray(rows) || rows.length !== BRANCH_RESOURCES.length) throw new TypeError('Complete permission matrix required');
  const resources = new Set(BRANCH_RESOURCES);
  const actions = new Set<string>(BRANCH_ACTIONS);
  const seen = new Set<string>();
  const result: BranchPermissionRow[] = [];
  for (const item of rows) {
    if (!item || typeof item !== 'object') throw new TypeError('Invalid permission row');
    const row = item as { resource?: unknown; actions?: unknown };
    if (typeof row.resource !== 'string' || !resources.has(row.resource as typeof BRANCH_RESOURCES[number]) || seen.has(row.resource)) {
      throw new TypeError('Invalid or duplicate resource');
    }
    if (!row.actions || typeof row.actions !== 'object' || Array.isArray(row.actions)) throw new TypeError('Invalid permission actions');
    const given = row.actions as Record<string, unknown>;
    if (Object.keys(given).some((key) => !actions.has(key))) throw new TypeError('Unknown permission action');
    const normalized: Record<string, boolean> = {};
    for (const action of BRANCH_ACTIONS) {
      if (typeof given[action] !== 'boolean') throw new TypeError('Each action must be explicitly true or false');
      normalized[action] = given[action] as boolean;
    }
    seen.add(row.resource);
    result.push({ resource: row.resource, actions: normalized });
  }
  return result;
}

/** Read a specific user's branch matrix; missing rows mean NO granted actions. */
export async function readBranchPermissions(
  db: BranchDatabase, principal: BranchPrincipal | null | undefined,
  userId: unknown, branchId: unknown,
): Promise<BranchPermissionRow[]> {
  requireManager(principal);
  if (!validBranchId(userId) || !validBranchId(branchId)) throw new BranchAccessError('INVALID_BRANCH');
  const [rows] = await db.execute(
    'SELECT resource, actions_json FROM user_branch_permissions WHERE user_id=? AND branch_id=?',
    [userId, branchId],
  );
  return (rows as Array<{ resource: string; actions_json: string }>).map((row) => {
    let actions: Record<string, boolean> = {};
    try { actions = JSON.parse(row.actions_json) as Record<string, boolean>; } catch { /* deny */ }
    return { resource: row.resource, actions };
  });
}

/** Updates only this user/branch pair, preserving other branches' permissions. */
export async function saveBranchPermissions(
  db: BranchDatabase, principal: BranchPrincipal | null | undefined,
  userId: unknown, branchId: unknown, rows: unknown,
): Promise<void> {
  requireManager(principal);
  if (!validBranchId(userId) || !validBranchId(branchId)) throw new BranchAccessError('INVALID_BRANCH');
  const normalized = validateMatrix(rows);
  const [membership] = await db.execute(
    'SELECT 1 AS allowed FROM user_branches ub INNER JOIN users u ON u.id=ub.user_id AND u.active=1 INNER JOIN branches b ON b.id=ub.branch_id AND b.active=1 WHERE ub.user_id=? AND ub.branch_id=? LIMIT 1',
    [userId, branchId],
  );
  if (!Array.isArray(membership) || membership.length === 0) throw new BranchAccessError('FORBIDDEN');
  for (const row of normalized) {
    await db.execute(
      'INSERT INTO user_branch_permissions (user_id, branch_id, resource, actions_json, updated_at, updated_by) VALUES (?, ?, ?, ?, NOW(), ?) ON DUPLICATE KEY UPDATE actions_json=VALUES(actions_json), updated_at=NOW(), updated_by=VALUES(updated_by)',
      [userId, branchId, row.resource, JSON.stringify(row.actions), principal.userId],
    );
  }
}

/** Query only the current authenticated user's selected branch. */
export async function ownBranchPermissions(
  db: BranchDatabase, userId: string, branchId: string,
): Promise<BranchPermissionRow[]> {
  if (!validBranchId(userId) || !validBranchId(branchId)) throw new BranchAccessError('INVALID_BRANCH');
  const [rows] = await db.execute(
    'SELECT resource, actions_json FROM user_branch_permissions WHERE user_id=? AND branch_id=?',
    [userId, branchId],
  );
  return (rows as Array<{resource: string; actions_json: string}>).map((row) => {
    let parsed: Record<string, boolean> = {};
    try { parsed = JSON.parse(row.actions_json) as Record<string, boolean>; } catch { /* fail closed */ }
    const safe: Record<string, boolean> = {};
    for (const a of BRANCH_ACTIONS) safe[a] = parsed[a] === true;
    return { resource: row.resource, actions: safe };
  });
}

/**
 * Effective RBAC = stored role template, overridden completely by explicit
 * user/branch rows. Missing permissions deny access by default.
 */
export async function ownEffectiveBranchPermissions(
  db:BranchDatabase,userId:string,branchId:string,role:string,
):Promise<BranchPermissionRow[]>{
  const overrides=await ownBranchPermissions(db,userId,branchId);
  if(role==='Developer')return overrides;
  const [templates]=await db.execute(
    'SELECT resource,can_view,can_create,can_edit,can_delete,raw_json FROM role_permissions WHERE role=?',
    [role],
  );
  const merged=new Map<string,BranchPermissionRow>();
  for(const record of templates as Array<Record<string,unknown>>){
    const resource=String(record.resource||'');
    if(!BRANCH_RESOURCES.includes(resource as typeof BRANCH_RESOURCES[number]))continue;
    let parsed:Record<string,unknown>={};
    try{
      const obj:unknown=JSON.parse(String(record.raw_json||'{}'));
      if(obj&&typeof obj==='object'&&!Array.isArray(obj)){
        const inner=(obj as {actions?:unknown}).actions;
        if(inner&&typeof inner==='object'&&!Array.isArray(inner))parsed=inner as Record<string,unknown>;
      }
    }catch{}
    const actions:Record<string,boolean>={};
    for(const a of BRANCH_ACTIONS)actions[a]=parsed[a]===true;
    // Relational columns preserve legacy 4-action role templates.
    actions.view=actions.view||Number(record.can_view)===1;
    actions.add=actions.add||Number(record.can_create)===1;
    actions.edit=actions.edit||Number(record.can_edit)===1;
    actions.delete=actions.delete||Number(record.can_delete)===1;
    merged.set(resource,{resource,actions});
  }
  for(const row of overrides)merged.set(row.resource,row);
  return [...merged.values()];
}
