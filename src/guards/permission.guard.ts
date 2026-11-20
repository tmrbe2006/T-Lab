import { authService } from '../auth/auth.service';
import { showToast } from '../components/common';
import { i18n } from '../i18n';
import type { PermissionAction, ResourceScreen, User } from '../types';

/**
 * Central RBAC Permission Function:
 * Checks whether the given user has permission to perform `action` on `resource`.
 */
export function can(
  user: User | null | undefined,
  action: PermissionAction,
  resource: ResourceScreen
): boolean {
  if (!user || !user.active) return false;

  // These administrative boundaries cannot be weakened by editable role rows.
  if (resource === 'settings') return user.role === 'Developer';
  if (resource === 'branches') {
    if (user.role === 'Developer') return ['view', 'add', 'edit', 'print'].includes(action);
    return user.role === 'Owner' && ['view', 'edit', 'print'].includes(action);
  }
  if (resource === 'permissions') {
    return (user.role === 'Developer' || user.role === 'Owner') &&
      ['view', 'print', 'edit', 'managePermissions'].includes(action);
  }

  if (typeof window !== 'undefined' && window.location.port === '3127') {
    // In the pilot, the current user must have a verified server branch session.
    const branch = authService.getActiveBranch();
    if (!branch) return false;
    // Developer is privileged; Owner can be restricted per-branch if explicitly configured.
    if (user.role === 'Developer') return true;
    if (user.role === 'Owner') {
      const configured = branch.permissions.find((row) => row.resource === resource);
      return configured ? configured.actions[action] === true : true;
    }
    // For ordinary staff, any missing user/branch/screen permission is denied.
    return authService.getBranchPermission(resource, action);
  }

  // In the original non-branch edition preserve legacy role permissions.
  if (user.role === 'Developer' || user.role === 'Owner') return true;

  // The saved role matrix is the sole authority for all ordinary roles.
  // Missing role/resource/actions fail closed, never default to full access.
  const actions = authService.getPermissionsFor(user.role, resource);
  return actions?.[action] === true;
}

/**
 * Enforces an action guard in services/controllers.
 * Logs unauthorized attempts in the Audit Log and returns false.
 */
export async function enforcePermission(
  action: PermissionAction,
  resource: ResourceScreen,
  contextDetails = ''
): Promise<boolean> {
  const user = authService.getCurrentUser();
  const allowed = can(user, action, resource);
  if (!allowed) {
    showToast(
      i18n.bi(
        `⚠️ ليس لديك صلاحية (${action}) على هذه الشاشة (${resource}).`,
        `⚠️ You do not have permission (${action}) for (${resource}).`
      ),
      'warning'
    );
    try {
      await authService.logAudit(
        `محاولة غير مصرح بها (${action}) / Unauthorized Action Attempt`,
        resource,
        'GUARD-BLOCKED',
        `User: ${user?.username || 'guest'}, Action: ${action}, Resource: ${resource}. ${contextDetails}`
      );
    } catch {
      // ignore audit error
    }
  }
  return allowed;
}

