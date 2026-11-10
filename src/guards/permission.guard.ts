import { authService } from '../auth/auth.service';
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
  if (user.role === 'Owner') return true;

  const actionsMap = authService.getPermissionsFor(user.role, resource);
  if (!actionsMap) return false;
  return Boolean(actionsMap[action]);
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
    await authService.logAudit(
      `محاولة غير مصرح بها (${action}) / Unauthorized Action Attempt`,
      resource,
      'GUARD-BLOCKED',
      `User: ${user?.username || 'guest'}, Action: ${action}, Resource: ${resource}. ${contextDetails}`
    );
  }
  return allowed;
}
