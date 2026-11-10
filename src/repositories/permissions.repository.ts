import { db } from '../db/database';
import { CacheService } from '../services/cache.service';
import type { AuditLog, LabSettings, Role, RoleName, RolePermission } from '../types';

const ROLES_CACHE_KEY = 'permissions:roles:all';
const PERMS_ALL_CACHE_KEY = 'permissions:all';
const PERMS_BY_ROLE_PREFIX = 'permissions:role:';
const SETTINGS_CACHE_KEY = 'settings:default';

export class PermissionsRepository {
  async getAllRoles(): Promise<Role[]> {
    return CacheService.get(ROLES_CACHE_KEY, () => db.roles.toArray());
  }

  async getAllPermissions(): Promise<RolePermission[]> {
    return CacheService.get(PERMS_ALL_CACHE_KEY, () => db.permissions.toArray());
  }

  async getPermissionsByRole(role: RoleName): Promise<RolePermission[]> {
    return CacheService.get(`${PERMS_BY_ROLE_PREFIX}${role}`, () =>
      db.permissions.where('role').equals(role).toArray()
    );
  }

  async savePermission(perm: RolePermission): Promise<string> {
    const res = await db.permissions.put(perm);
    CacheService.invalidate(PERMS_ALL_CACHE_KEY);
    CacheService.invalidate(`${PERMS_BY_ROLE_PREFIX}${perm.role}`);
    return res;
  }

  async saveBulkPermissions(perms: RolePermission[]): Promise<void> {
    await db.permissions.bulkPut(perms);
    CacheService.invalidate(PERMS_ALL_CACHE_KEY);
    CacheService.invalidatePrefix(PERMS_BY_ROLE_PREFIX);
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    const logs = await db.auditLogs.toArray();
    return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async addAuditLog(log: AuditLog): Promise<string> {
    return db.auditLogs.put(log);
  }

  async getSettings(): Promise<LabSettings | undefined> {
    return CacheService.get(SETTINGS_CACHE_KEY, () => db.settings.get('default'));
  }

  async saveSettings(settings: LabSettings): Promise<string> {
    const res = await db.settings.put(settings);
    CacheService.invalidate(SETTINGS_CACHE_KEY);
    return res;
  }
}

export const permissionsRepository = new PermissionsRepository();
