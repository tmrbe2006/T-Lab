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
  input: { id: string; nameAr: string; nameEn?: string | null },
): Promise<string> {
  if (principal?.role !== 'Developer' || !principal.active) throw new BranchAccessError('FORBIDDEN');
  if (!validBranchId(input.id)) throw new TypeError('Invalid branch ID');
  const name = normalizedName(input.nameAr);
  const english = input.nameEn ? normalizedName(input.nameEn) : null;
  // Allocate numeric branch codes atomically on the SAME MySQL connection.
  // The unique branch code constraint remains the final concurrency safeguard.
  const [maxRows] = await database.execute(
    "SELECT COALESCE(MAX(CAST(SUBSTRING(code, 4) AS UNSIGNED)), 1) AS n FROM branches WHERE code REGEXP '^BR-[0-9]+$'",
  );
  const nextMinimum = Math.max(1, Number((maxRows as Array<{ n?: number }>)[0]?.n || 1));
  await database.execute(
    "INSERT IGNORE INTO branch_sequences (branch_id, sequence_name, next_value) VALUES ('branch_main', 'branch_code', ?)",
    [nextMinimum],
  );
  await database.execute(
    "UPDATE branch_sequences SET next_value = LAST_INSERT_ID(GREATEST(next_value, ?) + 1) WHERE branch_id='branch_main' AND sequence_name='branch_code'",
    [nextMinimum],
  );
  const [idRows] = await database.execute('SELECT LAST_INSERT_ID() AS n');
  const number = Number((idRows as Array<{ n?: number }>)[0]?.n);
  if (!Number.isSafeInteger(number) || number <= 1) throw new Error('Branch code sequence unavailable');
  const code = `BR-${String(number).padStart(3, '0')}`;
  await database.execute(
    'INSERT INTO branches (id, code, name_ar, name_en, active, is_main, created_at) VALUES (?, ?, ?, ?, 1, 0, NOW())',
    [input.id, code, name, english],
  );
  return code;
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
