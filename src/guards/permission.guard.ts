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
  // System Settings & Backup is strictly reserved for the Developer role
  if (resource === 'settings') {
    return user.role === 'Developer';
  }
  if (user.role === 'Developer') return true;
  if (user.role === 'Owner') return true;

  // Ensure core operational lab workflows (results entry, result review, requests, samples)
  // work seamlessly across lab staff roles even if legacy IndexedDB permission rows exist
  if (resource === 'results') {
    if (['Doctor', 'Chemist', 'Technician', 'Receptionist'].includes(user.role)) {
      if (['view', 'add', 'edit', 'print', 'approve', 'reopenResult'].includes(action)) {
        return true;
      }
    }
  }
  if (resource === 'resultReview') {
    if (['Doctor', 'Chemist', 'Technician'].includes(user.role)) {
      if (['view', 'add', 'edit', 'print', 'approve', 'reopenResult'].includes(action)) {
        return true;
      }
    }
  }

  const actionsMap = authService.getPermissionsFor(user.role, resource);
  if (!actionsMap) {
    // Fallback for newly added enterprise modules on existing databases
    if (resource === 'microbiology' || resource === 'qualityControl') {
      if (user.role === 'Doctor' || user.role === 'Chemist') {
        return ['view', 'add', 'edit', 'delete', 'print', 'export', 'approve'].includes(action);
      }
      if (user.role === 'Technician') {
        return ['view', 'add', 'edit', 'print'].includes(action);
      }
    }
    if (resource === 'homeVisits') {
      if (['Doctor', 'Chemist', 'Technician', 'Receptionist'].includes(user.role)) {
        return ['view', 'add', 'edit', 'delete', 'print'].includes(action);
      }
    }
    if (resource === 'corporateContracts') {
      if (['Accountant', 'Receptionist', 'Doctor'].includes(user.role)) {
        return ['view', 'add', 'edit', 'print', 'export', 'discount'].includes(action);
      }
    }
    return false;
  }
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

