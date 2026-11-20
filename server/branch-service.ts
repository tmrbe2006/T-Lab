import {
  BranchAccessError,
  requireBranchAccess,
  validBranchId,
  type BranchPrincipal,
  type BranchScope,
} from './branch-access';

/**
 * Branch administration service intended for authenticated server handlers.
 * IMPORTANT: The caller must resolve principal from a verified server session.
 * Never derive a principal from localStorage or an unverified HTTP payload.
 *
 * This module does not register routes and is not exposed to browser clients.
 */
export interface BranchDatabase {
  execute(sql: string, params?: unknown[]): Promise<[unknown, unknown]>;
}

export interface BranchInfo extends BranchScope {
  code: string;
  nameAr: string;
  nameEn: string | null;
}

function requireAdministrator(principal: BranchPrincipal | null | undefined): asserts principal is BranchPrincipal {
  if (!principal?.active || !principal.userId ||
      (principal.role !== 'Developer' && principal.role !== 'Owner')) {
    throw new BranchAccessError('FORBIDDEN');
  }
}

function normalizedName(input: unknown, maxLength = 191): string {
  if (typeof input !== 'string' || !input.trim() || input.trim().length > maxLength) {
    throw new TypeError('Invalid branch name');
  }
  return input.trim();
}

export async function listAccessibleBranches(
  database: BranchDatabase,
  principal: BranchPrincipal | null | undefined,
): Promise<BranchInfo[]> {
  if (!principal?.active || !principal.userId) throw new BranchAccessError('FORBIDDEN');
  const admin = principal.role === 'Developer' || principal.role === 'Owner';
  const assigned = [...principal.assignedBranchIds].filter(validBranchId);
  if (!admin && assigned.length === 0) return [];

  const sql = admin
    ? 'SELECT id, code, name_ar, name_en, active, is_main FROM branches WHERE active = 1 ORDER BY code'
    : `SELECT id, code, name_ar, name_en, active, is_main FROM branches WHERE active = 1 AND id IN (${assigned.map(() => '?').join(',')}) ORDER BY code`;
  const [rows] = await database.execute(sql, admin ? [] : assigned);
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      branchId: String(r.id),
      code: String(r.code),
      nameAr: String(r.name_ar),
      nameEn: r.name_en == null ? null : String(r.name_en),
      active: Number(r.active) === 1,
      isMain: Number(r.is_main) === 1,
    };
  });
}

export async function createBranch(
  database: BranchDatabase,
  principal: BranchPrincipal | null | undefined,
  input: { id: string; code: string; nameAr: string; nameEn?: string | null },
): Promise<void> {
  if (principal?.role !== 'Developer' || !principal.active) throw new BranchAccessError('FORBIDDEN');
  if (!validBranchId(input.id) || !/^[A-Za-z0-9-]{2,32}$/.test(input.code)) {
    throw new TypeError('Invalid branch ID or code');
  }
  const name = normalizedName(input.nameAr);
  const english = input.nameEn ? normalizedName(input.nameEn) : null;
  await database.execute(
    'INSERT INTO branches (id, code, name_ar, name_en, active, is_main, created_at) VALUES (?, ?, ?, ?, 1, 0, NOW())',
    [input.id, input.code, name, english],
  );
}

export async function setUserBranchAssignment(
  database: BranchDatabase,
  principal: BranchPrincipal | null | undefined,
  userId: unknown,
  branchId: unknown,
): Promise<void> {
  requireAdministrator(principal);
  if (!validBranchId(userId) || !validBranchId(branchId)) {
    throw new BranchAccessError('INVALID_BRANCH');
  }
  // Both user and active branch must exist; otherwise INSERT SELECT writes zero rows.
  await database.execute(
    `INSERT INTO user_branches (user_id, branch_id, is_default)
     SELECT u.id, b.id, 0 FROM users u JOIN branches b ON b.id = ? AND b.active = 1
     WHERE u.id = ? AND u.active = 1
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [branchId, userId],
  );
}

export async function getAccessibleBranch(
  database: BranchDatabase,
  principal: BranchPrincipal | null | undefined,
  requestedBranchId: unknown,
): Promise<BranchScope> {
  const branches = await listAccessibleBranches(database, principal);
  return requireBranchAccess(principal, requestedBranchId, branches);
}
