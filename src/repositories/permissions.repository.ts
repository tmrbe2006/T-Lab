import { db } from '../db/database';
import type { AuditLog, LabSettings, Role, RoleName, RolePermission } from '../types';

export class PermissionsRepository {
  async getAllRoles(): Promise<Role[]> {
    return db.roles.toArray();
  }

  async getAllPermissions(): Promise<RolePermission[]> {
    return db.permissions.toArray();
  }

  async getPermissionsByRole(role: RoleName): Promise<RolePermission[]> {
    return db.permissions.where('role').equals(role).toArray();
  }

  async savePermission(perm: RolePermission): Promise<string> {
    return db.permissions.put(perm);
  }

  async saveBulkPermissions(perms: RolePermission[]): Promise<void> {
    await db.permissions.bulkPut(perms);
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    const logs = await db.auditLogs.toArray();
    return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async addAuditLog(log: AuditLog): Promise<string> {
    return db.auditLogs.put(log);
  }

  async getSettings(): Promise<LabSettings | undefined> {
    return db.settings.get('default');
  }

  async saveSettings(settings: LabSettings): Promise<string> {
    return db.settings.put(settings);
  }
}

export const permissionsRepository = new PermissionsRepository();
