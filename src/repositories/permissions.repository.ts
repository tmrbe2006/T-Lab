import { db } from '../db/database';
import { useMySQLStore } from './mysql-all-stores.read';
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
    if (useMySQLStore()) {
      const response = await fetch('/api/branch-pilot/audit-log', {
        method:'POST', credentials:'same-origin', cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:log.action, screen:log.screen,
          recordId:log.recordId, details:log.details,
        }),
      });
      const data = await response.json() as {
        ok?:boolean; source?:string; id?:string; error?:string;
      };
      if (!response.ok || data.ok !== true)
        throw new Error(data.error || 'MYSQL_AUDIT_UNAVAILABLE');
      if (data.source !== 'mysql' || !data.id)
        throw new Error('MYSQL_AUDIT_RESPONSE_INVALID');
      return data.id;
    }
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
