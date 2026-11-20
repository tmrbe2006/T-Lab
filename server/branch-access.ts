/**
 * Server-side multi-branch access policy. Do not accept the principal or its
 * assignedBranchIds from an HTTP request body/header; they must be obtained
 * from a verified server-side session and the user_branches table.
 *
 * This module is intentionally pure until the application has authenticated
 * server sessions. DO NOT expose branch-scoped clinical endpoints using
 * browser localStorage roles as credentials.
 */
export type BranchRole =
  | 'Developer' | 'Owner' | 'Doctor' | 'Chemist'
  | 'Technician' | 'Receptionist' | 'Accountant';

export interface BranchPrincipal {
  userId: string;
  role: BranchRole;
  active: boolean;
  /** Server-queried user_branches assignments, never client-supplied. */
  assignedBranchIds: ReadonlySet<string>;
}

export interface BranchScope {
  branchId: string;
  isMain: boolean;
  active: boolean;
}

export class BranchAccessError extends Error {
  constructor(public readonly code: 'INVALID_BRANCH' | 'INACTIVE_BRANCH' | 'FORBIDDEN') {
    super(code);
    this.name = 'BranchAccessError';
  }
}

/** Only canonical branch IDs may be used as SQL parameter values. */
export function validBranchId(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 64 &&
    /^[a-zA-Z0-9_-]+$/.test(value);
}

/**
 * Resolve an explicit, authenticated request to an active branch.
 * Never silently fall back to the main branch for ordinary staff.
 */
export function requireBranchAccess(
  principal: BranchPrincipal | null | undefined,
  requestedId: unknown,
  available: readonly BranchScope[],
): BranchScope {
  if (!validBranchId(requestedId)) throw new BranchAccessError('INVALID_BRANCH');
  if (!principal || !principal.active || !principal.userId) {
    throw new BranchAccessError('FORBIDDEN');
  }
  const branch = available.find((b) => b.branchId === requestedId);
  if (!branch) throw new BranchAccessError('INVALID_BRANCH');
  if (!branch.active) throw new BranchAccessError('INACTIVE_BRANCH');
  if (principal.role !== 'Developer' && principal.role !== 'Owner' &&
      !principal.assignedBranchIds.has(branch.branchId)) {
    throw new BranchAccessError('FORBIDDEN');
  }
  return branch;
}

/**
 * A record is only accessible within its own branch. This prevents the
 * caller from using a valid branch selection to access another branch's row.
 */
export function requireRecordBranch(
  recordBranchId: unknown,
  grantedBranchId: string,
): void {
  if (!validBranchId(recordBranchId) || recordBranchId !== grantedBranchId) {
    throw new BranchAccessError('FORBIDDEN');
  }
}

/** Every SQL query must also include the authorized branch_id parameter. */
export function branchPredicate(alias = ''): string {
  if (alias && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) {
    throw new BranchAccessError('INVALID_BRANCH');
  }
  return (alias ? `\`${alias}\`.` : '') + '`branch_id` = ?';
}
