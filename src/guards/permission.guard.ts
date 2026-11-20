import { authService } from '../auth/auth.service';
import { showToast } from '../components/common';
import { i18n } from '../i18n';
import type { PermissionAction, ResourceScreen, User } from '../types';

/**
 * Central RBAC Permission Function:
 * Checks whether the given user has permission to perform `action` on `resource`.
 */
const DEVELOPER_ONLY_RESOURCES = new Set<ResourceScreen>(['settings']);
const ADMINISTRATIVE_RESOURCES = new Set<ResourceScreen>(['permissions', 'users']);

/**
 * Deny by default. The permissions matrix is the sole authority for normal roles.
 * This client-side check improves UX, but it is NOT a substitute for server-side RBAC.
 */
export function can(
  user: User | null | undefined,
  action: PermissionAction,
  resource: ResourceScreen
): boolean {
  if (!user || !user.active) return false;
  if (DEVELOPER_ONLY_RESOURCES.has(resource) && user.role !== 'Developer') return false;
  if (action === 'managePermissions' && user.role !== 'Developer') return false;
  if (user.role === 'Developer') return true;

  // Administrative screens cannot be exposed to ordinary staff even by a
  // corrupt or stale local permissions row.
  if (ADMINISTRATIVE_RESOURCES.has(resource) && user.role !== 'Owner') return false;

  const permissions = authService.getPermissionsFor(user.role, resource);
  if (!permissions) return false;
  return permissions[action] === true;
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

